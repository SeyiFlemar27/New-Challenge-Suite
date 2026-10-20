import { getAdminDb } from "@/lib/firebase/admin";
import { requireRequestUser } from "@/lib/server/auth";
import { conflict, fail, ok, readJson, serverUnavailable } from "@/lib/server/responses";
import { evaluateTournamentJoinEligibility, nextWaitlistPosition, participantRecord } from "@/lib/server/tournament-operations";
import type { TournamentFoundation, TournamentParticipantFoundation } from "@/lib/tournament-types";
import { tournamentRegistrationReady } from "@/lib/server/tournament-publication";
import { getStripe } from "@/lib/stripe";
import { createTournamentEntryCheckout } from "@/lib/server/tournament-paid-entry";
import { dispatchTournamentActivationOutbox, isTournamentV3SchedulingReady } from "@/lib/server/tournament-cloud-tasks";

export const dynamic = "force-dynamic";

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const { user, response } = await requireRequestUser(request);
  if (response) return response;
  const db = getAdminDb();
  if (!db) return serverUnavailable("Tournament registration");
  const parsed = await readJson(request);
  if (parsed.response) return parsed.response;
  const body = parsed.body && typeof parsed.body === "object" ? bodyAsRecord(parsed.body) : {};
  const { id } = await context.params;
  const preliminaryTournament = await db.collection("tournaments").doc(id).get();
  if (preliminaryTournament.data()?.publicationPolicyVersion === 1 && (!await tournamentRegistrationReady(db) || preliminaryTournament.data()?.publicVisibility === false)) return fail("Tournament registration is temporarily unavailable.", 503, undefined, "TOURNAMENT_SCHEDULER_UNAVAILABLE");
  if (preliminaryTournament.exists && Number(preliminaryTournament.data()?.configVersion ?? 1) >= 3) {
    if (String(preliminaryTournament.data()?.participationMode ?? "individual") === "team") return fail("Create or join a complete Tournament team to reserve a bracket slot.", 409, undefined, "TEAM_REGISTRATION_REQUIRED");
    if (process.env.NODE_ENV === "production" && !isTournamentV3SchedulingReady()) return fail("Tournament registration is temporarily unavailable while its background scheduler is not configured.", 503, undefined, "TOURNAMENT_SCHEDULER_UNAVAILABLE");
    if (String(preliminaryTournament.data()?.entryType ?? "free") !== "free") {
      if (process.env.TOURNAMENT_ENTRY_PAYMENTS_ENABLED !== "true") return fail("Tournament entry payments are not enabled in this environment.", 503, undefined, "TOURNAMENT_PAYMENT_DISABLED");
      const stripe = getStripe();
      const appUrl = process.env.NEXT_PUBLIC_APP_URL;
      if (!stripe || !appUrl) return fail("Tournament entry payment processing is not configured.", 503, undefined, "PAYMENT_CONFIGURATION_ERROR");
      try {
        const checkout = await createTournamentEntryCheckout(db, stripe, {
          tournamentId: id,
          target: { mode: "individual", participantId: `${id}_${user.uid}`, userId: user.uid },
          rulesAccepted: body.rulesAccepted === true,
          invitationId: typeof body.invitationId === "string" ? body.invitationId : null,
          appUrl
        });
        if (!checkout.checkoutUrl) return conflict("This entry reservation is being connected to checkout. Refresh in a moment.");
        return ok({ paymentStatus: "pending", reservationId: checkout.reservationId, reservationExpiresAt: checkout.expiresAt, checkoutUrl: checkout.checkoutUrl }, "A ten-minute Tournament entry slot is reserved. Payment confirmation is required to complete registration.");
      } catch (error) {
        const failure = error as Error & { code?: string; status?: number };
        if (failure.code) return fail(failure.message, failure.status ?? 409, undefined, failure.code);
        console.error("[tournament-entry-checkout] checkout creation failed", { tournamentId: id, userId: user.uid, errorName: failure.name });
        return serverUnavailable("Tournament entry checkout");
      }
    }
    return registerVersionThreeEntrant({ db, id, user, body });
  }
  const tournamentSnap = await db.collection("tournaments").doc(id).get();
  if (!tournamentSnap.exists) return fail("Tournament not found.", 404, undefined, "TOURNAMENT_NOT_FOUND");
  const tournament = { id: tournamentSnap.id, ...tournamentSnap.data() } as TournamentFoundation;
  const participantsSnap = await db.collection("tournamentParticipants").where("tournamentId", "==", id).limit(1000).get();
  const participants = participantsSnap.docs.map((doc) => ({ id: doc.id, ...doc.data() })) as TournamentParticipantFoundation[];
  const invitationId = typeof body.invitationId === "string" ? body.invitationId : "";
  const invitationSnap = invitationId ? await db.collection("tournamentInvitations").doc(invitationId).get() : null;
  const [profileSnap, paymentSnap] = await Promise.all([
    db.collection("users").doc(user.uid).get(),
    db.collection("tournamentEntryPayments").doc(`${id}_${user.uid}`).get()
  ]);
  const profile = profileSnap.exists ? profileSnap.data() ?? {} : {};
  const eligibility = evaluateTournamentJoinEligibility({
    tournament,
    actor: { uid: user.uid, role: user.role },
    participants,
    invitation: invitationSnap?.exists ? { id: invitationSnap.id, ...invitationSnap.data() } as any : null,
    profileComplete: Boolean(profile.displayName || profile.username),
    kycApproved: String(profile.kycStatus ?? "").toLowerCase() === "verified",
    rulesAccepted: body.rulesAccepted === true,
    paymentConfirmed: paymentSnap.exists && paymentSnap.data()?.status === "confirmed" && paymentSnap.data()?.webhookConfirmed === true
  });
  if (!eligibility.allowed) return fail(eligibility.message, 403, eligibility, eligibility.code);
  const participantId = `${id}_${user.uid}`;
  const outcome = eligibility.outcome ?? "registered";
  const waitlistPosition = outcome === "waitlisted" ? nextWaitlistPosition(participants) : null;
  const participant = participantRecord({ id: participantId, tournamentId: id, userId: user.uid, status: outcome, inviteId: invitationId || null, waitlistPosition });
  try {
    await db.runTransaction(async (transaction) => {
      const participantRef = db.collection("tournamentParticipants").doc(participantId);
      const existing = await transaction.get(participantRef);
      if (existing.exists) throw new Error("DUPLICATE_PARTICIPANT");
      transaction.set(participantRef, participant);
      if (outcome === "registered") {
        transaction.set(db.collection("tournaments").doc(id), { participantCount: participants.filter((item) => ["registered", "checked_in", "active"].includes(item.status)).length + 1, updatedAt: participant.updatedAt }, { merge: true });
      }
      transaction.set(db.collection("tournamentAuditEvents").doc(`${participantId}_join`), { id: `${participantId}_join`, tournamentId: id, actorId: user.uid, action: outcome === "pending_approval" ? "application_submitted" : outcome === "waitlisted" ? "waitlist_joined" : "participant_registered", createdAt: participant.createdAt, metadata: { outcome } });
    });
  } catch (error) {
    if (error instanceof Error && error.message === "DUPLICATE_PARTICIPANT") return conflict("Duplicate tournament registration is blocked.");
    throw error;
  }
  return ok({ participant, outcome, participantCountIncremented: outcome === "registered" }, outcome === "waitlisted" ? "Waitlist entry created." : outcome === "pending_approval" ? "Application submitted for host review." : "Tournament registration confirmed.");
}

function bodyAsRecord(value: unknown) {
  return value as Record<string, unknown>;
}

async function registerVersionThreeEntrant(params: {
  db: FirebaseFirestore.Firestore;
  id: string;
  user: { uid: string; role?: string };
  body: Record<string, unknown>;
}) {
  const { db, id, user, body } = params;
  const tournamentRef = db.collection("tournaments").doc(id);
  const participantRef = db.collection("tournamentParticipants").doc(`${id}_${user.uid}`);
  const profileRef = db.collection("users").doc(user.uid);
  const publicProfileRef = db.collection("profiles").doc(user.uid);
  const invitationId = typeof body.invitationId === "string" ? body.invitationId : "";
  const invitationRef = invitationId ? db.collection("tournamentInvitations").doc(invitationId) : null;
  const now = new Date();
  const nowIso = now.toISOString();
  let participant: TournamentParticipantFoundation | null = null;
  let count = 0;
  let activationQueued = false;
  let activationJobId: string | null = null;
  try {
    await db.runTransaction(async (transaction) => {
      const [tournamentSnap, participantSnap, accountSnap, profileSnap, invitationSnap, entrantsSnap] = await Promise.all([
        transaction.get(tournamentRef),
        transaction.get(participantRef),
        transaction.get(profileRef),
        transaction.get(publicProfileRef),
        invitationRef ? transaction.get(invitationRef) : Promise.resolve(null),
        transaction.get(db.collection("tournamentParticipants").where("tournamentId", "==", id).limit(129))
      ]);
      if (!tournamentSnap.exists) throw Object.assign(new Error("Tournament not found."), { code: "TOURNAMENT_NOT_FOUND", status: 404 });
      if (participantSnap.exists) throw Object.assign(new Error("You already have a Tournament registration state."), { code: "DUPLICATE_PARTICIPANT", status: 409 });
      const tournament = { id, ...tournamentSnap.data() } as TournamentFoundation;
      if (tournament.participationMode !== "individual") throw Object.assign(new Error("This Tournament requires team registration."), { code: "TEAM_REGISTRATION_REQUIRED", status: 409 });
      if (tournament.entryType !== "free") throw Object.assign(new Error("Paid Tournament entry is not available until its provider-confirmed checkout and refund flow are enabled."), { code: "TOURNAMENT_PAID_ENTRY_SETUP_REQUIRED", status: 409 });
      const entrants = entrantsSnap.docs.map((doc) => ({ id: doc.id, ...doc.data() })) as TournamentParticipantFoundation[];
      if (entrantsSnap.docs.length >= 129) throw Object.assign(new Error("Tournament registration requires capacity reconciliation."), { code: "TOURNAMENT_CAPACITY_RECONCILIATION_REQUIRED", status: 409 });
      const activeEntrants = entrants.filter((entrant) => ["registered", "checked_in", "active"].includes(entrant.status));
      const currentCount = activeEntrants.length;
      if (currentCount >= tournament.participantCapacity) throw Object.assign(new Error("Every Tournament bracket slot is full."), { code: "TOURNAMENT_CAPACITY_REACHED", status: 409 });
      const eligibility = evaluateTournamentJoinEligibility({
        tournament: { ...tournament, participantCount: currentCount },
        actor: { uid: user.uid, role: user.role },
        participants: entrants,
        invitation: invitationSnap?.exists ? { id: invitationSnap.id, ...invitationSnap.data() } as never : null,
        profileComplete: Boolean(accountSnap.data()?.displayName || accountSnap.data()?.username || profileSnap.data()?.displayName || profileSnap.data()?.username),
        rulesAccepted: body.rulesAccepted === true,
        paymentConfirmed: false,
        now
      });
      if (!eligibility.allowed) throw Object.assign(new Error(eligibility.message), { code: eligibility.code, status: eligibility.code === "AUTH_REQUIRED" ? 401 : 403 });
      if (eligibility.outcome !== "registered") throw Object.assign(new Error("Tournament registration could not reserve a confirmed bracket slot."), { code: "TOURNAMENT_SLOT_NOT_RESERVED", status: 409 });
      participant = participantRecord({ id: participantRef.id, tournamentId: id, userId: user.uid, status: "registered", inviteId: invitationId || null, now: nowIso });
      count = currentCount + 1;
      activationQueued = count === tournament.participantCapacity;
      const activationVersion = Math.max(0, Number(tournament.activationVersion ?? 0)) + (activationQueued ? 1 : 0);
      const activationWindowEndsAt = activationQueued ? new Date(now.getTime() + 5_000).toISOString() : null;
      transaction.create(participantRef, participant);
      transaction.update(tournamentRef, {
        participantCount: count,
        firstConfirmedEntrantAt: tournament.firstConfirmedEntrantAt ?? nowIso,
        timingLockedAt: tournament.timingLockedAt ?? nowIso,
        ...(activationQueued ? { activationVersion, activationState: "provisional", activationWindowEndsAt, registrationFullAt: nowIso } : {}),
        updatedAt: nowIso
      });
      transaction.create(db.collection("tournamentAuditEvents").doc(`${participantRef.id}_join`), { id: `${participantRef.id}_join`, tournamentId: id, actorId: user.uid, action: "participant_registered", createdAt: nowIso, metadata: { outcome: "registered", count, capacity: tournament.participantCapacity } });
      if (activationQueued) {
        activationJobId = id + "_activation_v" + activationVersion;
        transaction.create(db.collection("tournamentJobs").doc(activationJobId), { id: activationJobId, tournamentId: id, type: "activate_full_tournament", status: "pending", version: activationVersion, runAt: activationWindowEndsAt, schedulerDispatchState: "pending", schedulerDispatchAttempts: 0, createdAt: nowIso, updatedAt: nowIso });
      }
    });
  } catch (error) {
    const failure = error as Error & { code?: string; status?: number };
    if (failure.code) return fail(failure.message, failure.status ?? 409, undefined, failure.code);
    throw error;
  }
  const activationScheduleStatus = activationJobId ? (await dispatchTournamentActivationOutbox(db, activationJobId)).status : null;
  const { attemptTournamentNotifications } = await import("@/lib/server/tournament-notifications");
  await attemptTournamentNotifications(db, id);
  return ok({ participant, outcome: "registered", participantCount: count, activationQueued, activationScheduleStatus }, activationQueued
    ? activationScheduleStatus === "scheduled"
      ? "The final slot is reserved and the server activation task is scheduled after the five-second confirmation window."
      : "The final slot is reserved. Activation is pending scheduler reconciliation after the five-second confirmation window."
    : "Tournament registration confirmed.");
}
