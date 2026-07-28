import { getAdminDb } from "@/lib/firebase/admin";
import { requireRequestUser } from "@/lib/server/auth";
import { conflict, fail, ok, readJson, serverUnavailable } from "@/lib/server/responses";
import { evaluateTournamentJoinEligibility, nextWaitlistPosition, participantRecord } from "@/lib/server/tournament-operations";
import type { TournamentFoundation, TournamentParticipantFoundation } from "@/lib/tournament-types";

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
