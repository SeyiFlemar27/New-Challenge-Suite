import { FieldValue, type Firestore } from "firebase-admin/firestore";
import type Stripe from "stripe";
import type { TournamentFoundation, TournamentParticipantFoundation, TournamentTeamFoundation } from "@/lib/tournament-types";
import { deterministicId } from "@/lib/server/idempotency";
import { dispatchTournamentActivationOutbox } from "@/lib/server/tournament-cloud-tasks";

export const TOURNAMENT_ENTRY_RESERVATION_MS = 10 * 60 * 1000;
const ACTIVE_PARTICIPANT_STATUSES = new Set(["registered", "checked_in", "active"]);
const ACTIVE_TEAM_STATUSES = new Set(["ready", "checked_in", "active"]);
const BLOCKED_ACCOUNT_STATUSES = new Set(["disabled", "suspended", "deactivated", "blocked", "deleted", "deletion_requested", "anonymized"]);

type PaidEntryTarget = { mode: "individual"; participantId: string; userId: string } | { mode: "team"; teamId: string; userId: string };
type ReservationResult = { reservationId: string; paymentId: string; expiresAt: string; amountCents: number; currency: string; checkoutSessionId: string | null; checkoutUrl: string | null; existing: boolean };
type CodedError = Error & { code: string; status: number };

function coded(message: string, code: string, status = 409): CodedError { return Object.assign(new Error(message), { code, status }); }
function objectId(value: unknown): string | null {
  if (typeof value === "string") return value;
  if (value && typeof value === "object" && "id" in value && typeof value.id === "string") return value.id;
  return null;
}
function accountEligible(value: Record<string, unknown> | undefined) {
  const status = String(value?.accountStatus ?? (value?.suspended ? "suspended" : "active")).toLowerCase();
  const type = String(value?.accountType ?? value?.role ?? "user").toLowerCase();
  return Boolean(value) && !value?.disabled && !value?.suspended && !BLOCKED_ACCOUNT_STATUSES.has(status) && !["sponsor", "enterprise"].includes(type);
}
function activeCount(records: Array<Record<string, unknown>>, mode: PaidEntryTarget["mode"]) {
  return records.filter((record) => mode === "individual"
    ? ACTIVE_PARTICIPANT_STATUSES.has(String(record.status))
    : ACTIVE_TEAM_STATUSES.has(String(record.status)) && Boolean(record.slotReservedAt)).length;
}

/** Serializes capacity decisions on the Tournament document and stores an exactly ten-minute reservation. */
export async function reserveTournamentPaidEntry(db: Firestore, input: {
  tournamentId: string; target: PaidEntryTarget; rulesAccepted: boolean; invitationId?: string | null; now?: Date;
}): Promise<ReservationResult> {
  const now = input.now ?? new Date();
  const nowIso = now.toISOString();
  const nowMs = now.getTime();
  if (!input.rulesAccepted) throw coded("Tournament rules must be accepted before payment.", "RULES_REQUIRED", 422);
  const tournamentRef = db.collection("tournaments").doc(input.tournamentId);
  const subjectId = input.target.mode === "individual" ? input.target.participantId : input.target.teamId;
  const lockRef = db.collection("tournamentEntryReservationLocks").doc(deterministicId(input.tournamentId, input.target.mode, subjectId));
  const participantRef = input.target.mode === "individual" ? db.collection("tournamentParticipants").doc(input.target.participantId) : null;
  const teamRef = input.target.mode === "team" ? db.collection("tournamentTeams").doc(input.target.teamId) : null;
  const accountRef = db.collection("users").doc(input.target.userId);
  const profileRef = db.collection("profiles").doc(input.target.userId);
  const invitationRef = input.invitationId ? db.collection("tournamentInvitations").doc(input.invitationId) : null;
  let result: ReservationResult | null = null;

  await db.runTransaction(async (transaction) => {
    const participantQuery = db.collection("tournamentParticipants").where("tournamentId", "==", input.tournamentId).limit(501);
    const teamQuery = db.collection("tournamentTeams").where("tournamentId", "==", input.tournamentId).limit(501);
    const reservationQuery = db.collection("tournamentEntryReservations").where("tournamentId", "==", input.tournamentId).where("status", "==", "pending").limit(501);
    const reads = await Promise.all([
      transaction.get(tournamentRef), transaction.get(lockRef),
      transaction.get(participantRef ?? teamRef!), transaction.get(accountRef), transaction.get(profileRef),
      invitationRef ? transaction.get(invitationRef) : Promise.resolve(null),
      transaction.get(input.target.mode === "individual" ? participantQuery : teamQuery),
      transaction.get(reservationQuery),
      input.target.mode === "team" ? transaction.get(db.collection("tournamentTeamMemberships").doc(`${input.tournamentId}_${input.target.userId}`)) : Promise.resolve(null)
    ]);
    const [tournamentSnap, lockSnap, subjectSnap, accountSnap, profileSnap, invitationSnap, competitorsSnap, reservationsSnap, captainMembershipSnap] = reads;
    if (!tournamentSnap.exists) throw coded("Tournament not found.", "TOURNAMENT_NOT_FOUND", 404);
    const tournament = { id: input.tournamentId, ...tournamentSnap.data() } as TournamentFoundation & Record<string, unknown>;
    if (Number(tournament.configVersion ?? 1) < 3) throw coded("Paid entry checkout is available only for Tournament V3.", "TOURNAMENT_VERSION_UNSUPPORTED");
    if (tournament.entryType === "free") throw coded("This Tournament does not require an entry payment.", "PAYMENT_NOT_REQUIRED", 409);
    if (tournament.paymentActivationEnabled !== true) throw coded("Paid entry is not enabled for this Tournament yet.", "TOURNAMENT_PAYMENT_DISABLED", 409);
    if (tournament.status !== "registration_open") throw coded("Tournament registration is closed.", "REGISTRATION_NOT_OPEN");
    if (tournament.participationMode !== input.target.mode) throw coded("Tournament registration mode does not match this request.", "TOURNAMENT_MODE_MISMATCH");
    if (String(tournament.hostId) === input.target.userId) throw coded("Tournament hosts cannot enter their own Tournament.", "OWNER_CANNOT_JOIN", 403);
    if (!accountEligible(accountSnap.data())) throw coded("This account is not eligible to compete in Tournaments.", "ACCOUNT_NOT_ELIGIBLE", 403);
    const account = accountSnap.data() ?? {};
    const profile = profileSnap.data() ?? {};
    if (![account.displayName, account.username, profile.displayName, profile.username].some(Boolean)) throw coded("Complete your profile before entering this Tournament.", "PROFILE_REQUIRED", 422);
    if (tournament.registrationType === "invite_only") {
      if (!invitationSnap?.exists || invitationSnap.data()?.inviteeUserId !== input.target.userId || invitationSnap.data()?.status !== "pending") throw coded("A valid Tournament invitation is required.", "INVITATION_REQUIRED", 403);
      if (Date.parse(String(invitationSnap.data()?.expiresAt ?? "")) <= nowMs) throw coded("This Tournament invitation has expired.", "INVITATION_EXPIRED", 409);
    }
    if (input.target.mode === "team" && !subjectSnap?.exists) throw coded("Tournament team was not found.", "TOURNAMENT_SUBJECT_NOT_FOUND", 404);
    const subject = subjectSnap.data() ?? {};
    if (input.target.mode === "individual") {
      if (subjectSnap.exists && subject.userId !== input.target.userId) throw coded("This Tournament participant record belongs to another account.", "PARTICIPANT_OWNERSHIP_MISMATCH", 403);
      if (subjectSnap.exists && !["payment_pending"].includes(String(subject.status ?? ""))) throw coded("You already have a Tournament registration state.", "DUPLICATE_PARTICIPANT");
      if (competitorsSnap.size >= 501) throw coded("Tournament capacity requires reconciliation.", "TOURNAMENT_CAPACITY_RECONCILIATION_REQUIRED");
    } else {
      const team = subject as TournamentTeamFoundation & Record<string, unknown>;
      if (team.tournamentId !== input.tournamentId || team.captainUserId !== input.target.userId) throw coded("Only this Tournament team's Captain can pay its entry fee.", "TEAM_CAPTAIN_REQUIRED", 403);
      if (team.slotReservedAt || ["ready", "active", "checked_in"].includes(String(team.status))) throw coded("This Tournament team already has a confirmed bracket slot.", "TEAM_ALREADY_REGISTERED");
      const config = tournament.teamConfig;
      const members = Array.isArray(team.memberUserIds) ? team.memberUserIds.map(String) : [];
      if (!config || members.length < config.minimumSize || members.length > config.maximumSize || new Set(members).size !== members.length) throw coded("Complete a valid Tournament roster before checkout.", "TEAM_ROSTER_INVALID", 422);
      if (!captainMembershipSnap?.exists || captainMembershipSnap.data()?.teamId !== input.target.teamId || captainMembershipSnap.data()?.status !== "active") throw coded("Active Captain membership is required.", "TEAM_CAPTAIN_REQUIRED", 403);
      const [memberAccounts, memberMemberships] = await Promise.all([
        transaction.getAll(...members.map((memberId) => db.collection("users").doc(memberId))),
        transaction.getAll(...members.map((memberId) => db.collection("tournamentTeamMemberships").doc(`${input.tournamentId}_${memberId}`)))
      ]);
      if (memberAccounts.some((account) => !account.exists || !accountEligible(account.data()))
        || memberMemberships.some((membership, index) => !membership.exists || membership.data()?.teamId !== subjectId || membership.data()?.status !== "active" || (members[index] === input.target.userId && membership.data()?.role !== "captain"))) {
        throw coded("Every Tournament team member must pass account and membership verification.", "TEAM_MEMBER_REVALIDATION_FAILED", 403);
      }
      // The reservation snapshots the roster and pauses roster mutations until checkout expires.
      if (competitorsSnap.size >= 501) throw coded("Tournament capacity requires reconciliation.", "TOURNAMENT_CAPACITY_RECONCILIATION_REQUIRED");
    }

    const priorLock = lockSnap.data() ?? {};
    const priorId = String(priorLock.activeReservationId ?? "");
    if (priorId) {
      const priorRef = db.collection("tournamentEntryReservations").doc(priorId);
      const priorPaymentRef = db.collection("tournamentEntryPayments").doc(priorId);
      const [priorReservationSnap, priorPaymentSnap] = await Promise.all([transaction.get(priorRef), transaction.get(priorPaymentRef)]);
      const prior = priorReservationSnap.data() ?? {};
      if (priorReservationSnap.exists && prior.status === "pending" && Date.parse(String(prior.reservationExpiresAt ?? "")) > nowMs) {
        const payment = priorPaymentSnap.data() ?? {};
        result = { reservationId: priorId, paymentId: priorId, expiresAt: String(prior.reservationExpiresAt), amountCents: Number(prior.amountCents), currency: String(prior.currency), checkoutSessionId: typeof payment.providerSessionId === "string" ? payment.providerSessionId : null, checkoutUrl: typeof payment.checkoutUrl === "string" ? payment.checkoutUrl : null, existing: true };
        return;
      }
      if (priorReservationSnap.exists && prior.status === "pending") {
        transaction.set(priorRef, { status: "expired", expiredAt: nowIso, updatedAt: nowIso }, { merge: true });
        if (priorPaymentSnap.exists && priorPaymentSnap.data()?.status === "pending") {
          transaction.set(priorPaymentRef, { status: "expired", reservationStatus: "expired", updatedAt: nowIso }, { merge: true });
        }
        if (teamRef && subjectSnap?.data()?.paymentReservationId === priorId) {
          transaction.set(teamRef, { paymentReservationId: null, paymentReservationExpiresAt: null, updatedAt: nowIso }, { merge: true });
        }
      }
    }

    const competitors = competitorsSnap.docs.map((doc) => doc.data() ?? {}) as Array<Record<string, unknown>>;
    const confirmed = activeCount(competitors, input.target.mode);
    const pendingReservations = reservationsSnap.docs.map((doc) => doc.data() ?? {}).filter((reservation) => Date.parse(String(reservation.reservationExpiresAt ?? "")) > nowMs);
    if (reservationsSnap.size >= 501 || confirmed + pendingReservations.length >= Number(tournament.participantCapacity)) throw coded(reservationsSnap.size >= 501 ? "Tournament reservations require capacity reconciliation." : "Every Tournament bracket slot is reserved or full.", reservationsSnap.size >= 501 ? "TOURNAMENT_CAPACITY_RECONCILIATION_REQUIRED" : "TOURNAMENT_CAPACITY_REACHED");

    const amountCents = Math.round(Number(tournament.entryFeeAmountMinor));
    const currency = String(tournament.currency ?? "USD").toLowerCase();
    if (!Number.isSafeInteger(amountCents) || amountCents < 100 || !/^[a-z]{3}$/.test(currency)) throw coded("Tournament entry pricing is invalid.", "TOURNAMENT_ENTRY_PRICE_INVALID", 422);
    const sequence = Number(priorLock.sequence ?? 0) + 1;
    const reservationId = deterministicId("tournament_entry", input.tournamentId, input.target.mode, subjectId, sequence);
    const reservationRef = db.collection("tournamentEntryReservations").doc(reservationId);
    const paymentRef = db.collection("tournamentEntryPayments").doc(reservationId);
    const expiresAt = new Date(nowMs + TOURNAMENT_ENTRY_RESERVATION_MS).toISOString();
    const rosterUserIds = input.target.mode === "team" ? [...new Set((subject.memberUserIds as string[]).map(String))] : [];
    const record = {
      id: reservationId, tournamentId: input.tournamentId, entrantType: input.target.mode,
      entrantId: subjectId, participantId: input.target.mode === "individual" ? input.target.participantId : null,
      teamId: input.target.mode === "team" ? input.target.teamId : null, userId: input.target.userId,
      rosterUserIds, invitationId: input.invitationId ?? null, amountCents, currency,
      status: "pending", reservationCreatedAt: nowIso, reservationExpiresAt: expiresAt,
      createdAt: nowIso, updatedAt: nowIso
    };
    transaction.create(reservationRef, record);
    transaction.create(paymentRef, { ...record, provider: "stripe", paymentPurpose: "tournament_entry", status: "pending", webhookConfirmed: false, providerSessionId: null, providerPaymentIntentId: null, refundStatus: "not_required", idempotencyKey: reservationId });
    if (participantRef && subjectSnap.exists) transaction.set(participantRef, { entryPaymentId: reservationId, updatedAt: nowIso }, { merge: true });
    if (teamRef) transaction.set(teamRef, { paymentReservationId: reservationId, paymentReservationExpiresAt: expiresAt, updatedAt: nowIso }, { merge: true });
    transaction.set(lockRef, { tournamentId: input.tournamentId, entrantType: input.target.mode, entrantId: subjectId, activeReservationId: reservationId, sequence, updatedAt: nowIso }, { merge: true });
    // Every reservation mutates the Tournament row so concurrent last-slot attempts serialize on one document.
    transaction.update(tournamentRef, { paidEntryReservationVersion: FieldValue.increment(1), updatedAt: nowIso });
    transaction.create(db.collection("tournamentAuditEvents").doc(`${reservationId}_reserved`), { id: `${reservationId}_reserved`, tournamentId: input.tournamentId, actorId: input.target.userId, action: "paid_entry_slot_reserved", createdAt: nowIso, metadata: { entrantType: input.target.mode, entrantId: subjectId, amountCents, currency, expiresAt } });
    result = { reservationId, paymentId: reservationId, expiresAt, amountCents, currency, checkoutSessionId: null, checkoutUrl: null, existing: false };
  });
  if (!result) throw new Error("Tournament paid-entry reservation did not produce a result.");
  return result;
}

export async function createTournamentEntryCheckout(db: Firestore, stripe: Stripe, input: {
  tournamentId: string; target: PaidEntryTarget; rulesAccepted: boolean; invitationId?: string | null; appUrl: string; now?: Date;
}) {
  const reservation = await reserveTournamentPaidEntry(db, input);
  if (reservation.checkoutSessionId && reservation.checkoutUrl) return { ...reservation, reused: true };
  const session = await stripe.checkout.sessions.create({
    mode: "payment",
    payment_method_types: ["card"],
    // Stripe Checkout requires at least a 30-minute provider session. The
    // separate ten-minute Firestore reservation remains the product deadline.
    expires_at: Math.floor(Date.now() / 1000) + 35 * 60,
    client_reference_id: reservation.paymentId,
    metadata: {
      paymentPurpose: "tournament_entry", tournamentId: input.tournamentId,
      reservationId: reservation.reservationId, paymentId: reservation.paymentId,
      entrantType: input.target.mode, entrantId: input.target.mode === "individual" ? input.target.participantId : input.target.teamId,
      userId: input.target.userId
    },
    line_items: [{ quantity: 1, price_data: { currency: reservation.currency, unit_amount: reservation.amountCents, product_data: { name: "Tournament entry", description: "Tournament bracket slot entry fee" } } }],
    success_url: `${input.appUrl}/tournaments/${encodeURIComponent(input.tournamentId)}/${input.target.mode === "team" ? "me" : "join"}?payment=processing&session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${input.appUrl}/tournaments/${encodeURIComponent(input.tournamentId)}/join?payment=canceled`
  }, { idempotencyKey: `tournament-entry-session-${reservation.reservationId}` });
  if (!session.id || !session.url) throw new Error("Stripe did not return a usable Tournament Checkout Session.");
  const now = new Date().toISOString();
  await db.runTransaction(async (transaction) => {
    const paymentRef = db.collection("tournamentEntryPayments").doc(reservation.paymentId);
    const reservationRef = db.collection("tournamentEntryReservations").doc(reservation.reservationId);
    const [paymentSnap, reservationSnap] = await Promise.all([transaction.get(paymentRef), transaction.get(reservationRef)]);
    const payment = paymentSnap.data() ?? {};
    if (!paymentSnap.exists || !reservationSnap.exists || payment.status !== "pending" || payment.reservationExpiresAt !== reservation.expiresAt) throw coded("Tournament payment reservation changed during checkout creation.", "TOURNAMENT_RESERVATION_CHANGED");
    if (payment.providerSessionId && payment.providerSessionId !== session.id) throw coded("A different Checkout Session is already linked to this reservation.", "TOURNAMENT_SESSION_CONFLICT");
    transaction.set(paymentRef, { providerSessionId: session.id, checkoutUrl: session.url, checkoutSessionExpiresAt: session.expires_at ? new Date(session.expires_at * 1000).toISOString() : null, updatedAt: now }, { merge: true });
    transaction.set(reservationRef, { providerSessionId: session.id, updatedAt: now }, { merge: true });
  });
  return { ...reservation, checkoutSessionId: session.id, checkoutUrl: session.url, reused: false };
}

export async function expireTournamentEntryReservation(db: Firestore, session: Stripe.Checkout.Session, now = new Date()) {
  const reservationId = String(session.metadata?.reservationId ?? "");
  if (!reservationId) throw new Error("Tournament Checkout Session is missing its reservation reference.");
  const reservationRef = db.collection("tournamentEntryReservations").doc(reservationId);
  const paymentRef = db.collection("tournamentEntryPayments").doc(reservationId);
  const teamRef = session.metadata?.entrantType === "team" && session.metadata?.entrantId
    ? db.collection("tournamentTeams").doc(String(session.metadata.entrantId)) : null;
  return db.runTransaction(async (transaction) => {
    const [reservationSnap, paymentSnap, teamSnap] = await Promise.all([transaction.get(reservationRef), transaction.get(paymentRef), teamRef ? transaction.get(teamRef) : Promise.resolve(null)]);
    if (!reservationSnap.exists || !paymentSnap.exists) throw new Error("Tournament reservation/payment record is missing.");
    const reservation = reservationSnap.data() ?? {};
    const payment = paymentSnap.data() ?? {};
    if (payment.providerSessionId !== session.id || payment.status !== "pending") return { handled: true, stale: true };
    if (session.payment_status === "paid") return { handled: true, stale: true, paymentConfirmedElsewhere: true };
    if (Date.parse(String(reservation.reservationExpiresAt)) > now.getTime()) return { handled: true, stale: true, reservationStillActive: true };
    transaction.set(reservationRef, { status: "expired", expiredAt: now.toISOString(), updatedAt: now.toISOString() }, { merge: true });
    transaction.set(paymentRef, { status: "expired", reservationStatus: "expired", updatedAt: now.toISOString() }, { merge: true });
    if (teamRef && teamSnap?.data()?.paymentReservationId === reservationId) transaction.set(teamRef, { paymentReservationId: null, paymentReservationExpiresAt: null, updatedAt: now.toISOString() }, { merge: true });
    return { handled: true, expired: true };
  });
}

type ProviderEvidence = { paymentIntent: Stripe.PaymentIntent; charge: Stripe.Charge };
function assertPaidEntryProviderEvidence(session: Stripe.Checkout.Session, evidence: ProviderEvidence) {
  if (session.mode !== "payment" || session.payment_status !== "paid" || session.metadata?.paymentPurpose !== "tournament_entry") throw new Error("Tournament Checkout Session is not a paid one-time entry payment.");
  if (evidence.paymentIntent.status !== "succeeded" || !["automatic", "automatic_async"].includes(String(evidence.paymentIntent.capture_method))) throw new Error("Tournament entry PaymentIntent is not a successfully captured automatic card payment.");
  if (!evidence.charge.paid || !evidence.charge.captured || evidence.charge.status !== "succeeded" || evidence.charge.payment_method_details?.type !== "card") throw new Error("Tournament entry Charge is not a captured card payment.");
  if (!session.payment_method_types?.length || session.payment_method_types.some((method) => method !== "card")) throw new Error("Tournament Checkout Session used an unsupported payment method.");
  if (typeof session.amount_total !== "number" || evidence.paymentIntent.amount_received !== session.amount_total || evidence.charge.amount_captured !== session.amount_total) throw new Error("Tournament provider amount evidence is inconsistent.");
  if (String(session.currency).toLowerCase() !== String(evidence.paymentIntent.currency).toLowerCase() || String(session.currency).toLowerCase() !== String(evidence.charge.currency).toLowerCase()) throw new Error("Tournament provider currency evidence is inconsistent.");
  if (String(evidence.paymentIntent.id) !== String(typeof session.payment_intent === "string" ? session.payment_intent : session.payment_intent?.id)) throw new Error("Tournament Checkout Session and PaymentIntent references do not match.");
}

/** Confirms the paid entry atomically. A late success gets a fresh capacity/eligibility check; otherwise it becomes a required, idempotent refund case. */
export async function confirmTournamentEntryPayment(db: Firestore, session: Stripe.Checkout.Session, evidence: ProviderEvidence, now = new Date()) {
  assertPaidEntryProviderEvidence(session, evidence);
  const metadata = session.metadata ?? {};
  const reservationId = String(metadata.reservationId ?? "");
  const paymentId = String(metadata.paymentId ?? "");
  const tournamentId = String(metadata.tournamentId ?? "");
  const entrantType = String(metadata.entrantType ?? "");
  const entrantId = String(metadata.entrantId ?? "");
  const userId = String(metadata.userId ?? "");
  if (!reservationId || reservationId !== paymentId || !tournamentId || !entrantId || !userId || !["individual", "team"].includes(entrantType)) throw new Error("Tournament Checkout Session metadata is incomplete.");
  const reservationRef = db.collection("tournamentEntryReservations").doc(reservationId);
  const paymentRef = db.collection("tournamentEntryPayments").doc(paymentId);
  const tournamentRef = db.collection("tournaments").doc(tournamentId);
  const competitorCollection = entrantType === "team" ? "tournamentTeams" : "tournamentParticipants";
  const competitorRef = db.collection(competitorCollection).doc(entrantId);
  const competitorQuery = db.collection(competitorCollection).where("tournamentId", "==", tournamentId).limit(501);
  const reservationQuery = db.collection("tournamentEntryReservations").where("tournamentId", "==", tournamentId).where("status", "==", "pending").limit(501);
  const accountRef = db.collection("users").doc(userId);
  const profileRef = db.collection("profiles").doc(userId);
  const lockRef = db.collection("tournamentEntryReservationLocks").doc(deterministicId(tournamentId, entrantType, entrantId));
  let result: Record<string, unknown> = { handled: true, kind: "tournament_entry", status: "payment_review_required" };
  let activationJobId: string | null = null;

  await db.runTransaction(async (transaction) => {
    const [reservationSnap, paymentSnap, tournamentSnap, competitorSnap, competitorRows, reservationRows, accountSnap, profileSnap, lockSnap] = await Promise.all([
      transaction.get(reservationRef), transaction.get(paymentRef), transaction.get(tournamentRef), transaction.get(competitorRef),
      transaction.get(competitorQuery), transaction.get(reservationQuery), transaction.get(accountRef), transaction.get(profileRef), transaction.get(lockRef)
    ]);
    if (!reservationSnap.exists || !paymentSnap.exists || !tournamentSnap.exists) throw new Error("Tournament entry reservation, payment, or Tournament record is missing.");
    const payment = paymentSnap.data() ?? {};
    const reservation = reservationSnap.data() ?? {};
    if (payment.providerSessionId !== session.id || payment.tournamentId !== tournamentId || payment.entrantId !== entrantId || payment.userId !== userId || Number(payment.amountCents) !== session.amount_total || String(payment.currency).toLowerCase() !== String(session.currency).toLowerCase()) throw new Error("Tournament payment does not match its stored reservation.");
    if (payment.status === "confirmed" && payment.webhookConfirmed === true) { result = { handled: true, kind: "tournament_entry", status: "confirmed", duplicate: true }; return; }
    if (["refunded", "refund_pending"].includes(String(payment.status))) {
      result = {
        handled: true,
        kind: "tournament_entry",
        status: payment.status,
        duplicate: true,
        refundRetryRequired: payment.status === "refund_pending" && payment.refundType === "mandatory_tournament_entry_reversal"
      };
      return;
    }
    const tournament = { id: tournamentId, ...tournamentSnap.data() } as TournamentFoundation & Record<string, unknown>;
    const reservationCreatedAt = Date.parse(String(reservation.reservationCreatedAt ?? ""));
    const reservationExpiresAt = Date.parse(String(reservation.reservationExpiresAt ?? ""));
    const reservationPolicyValid = Number.isFinite(reservationCreatedAt) && Number.isFinite(reservationExpiresAt)
      && reservationExpiresAt - reservationCreatedAt === TOURNAMENT_ENTRY_RESERVATION_MS;
    const reservationLinked = reservation.id === reservationId && reservation.tournamentId === tournamentId
      && reservation.entrantType === entrantType && reservation.entrantId === entrantId
      && reservation.userId === userId && Number(reservation.amountCents) === session.amount_total
      && String(reservation.currency).toLowerCase() === String(session.currency).toLowerCase();
    const competitor = competitorSnap.data() ?? {};
    let eligible = accountEligible(accountSnap.data());
    eligible &&= lockSnap.data()?.activeReservationId === reservationId;
    let ineligibleReason: string | null = null;
    if (!reservationLinked) ineligibleReason = "RESERVATION_ASSOCIATION_MISMATCH";
    else if (!reservationPolicyValid) ineligibleReason = "RESERVATION_TIMESTAMPS_INVALID";
    else if (tournament.entryType === "free" || tournament.paymentActivationEnabled !== true || tournament.participationMode !== entrantType) ineligibleReason = "TOURNAMENT_PAYMENT_CONFIGURATION_CHANGED";
    else if (Math.round(Number(tournament.entryFeeAmountMinor)) !== Number(reservation.amountCents)
      || String(tournament.currency ?? "USD").toLowerCase() !== String(reservation.currency ?? "").toLowerCase()) ineligibleReason = "TOURNAMENT_ENTRY_PRICE_CHANGED";
    eligible &&= !ineligibleReason;
    const profile = profileSnap.data() ?? {};
    eligible &&= [accountSnap.data()?.displayName, accountSnap.data()?.username, profile.displayName, profile.username].some(Boolean);
    if (tournament.status !== "registration_open") eligible = false;
    if (tournament.registrationType === "invite_only") {
      const invitationId = String(reservation.invitationId ?? "");
      const invitationSnap = invitationId ? await transaction.get(db.collection("tournamentInvitations").doc(invitationId)) : null;
      eligible &&= Boolean(invitationSnap?.exists && invitationSnap.data()?.inviteeUserId === userId && invitationSnap.data()?.status === "pending"
        && (!invitationSnap.data()?.expiresAt || Date.parse(String(invitationSnap.data()?.expiresAt)) > now.getTime()));
    }
    if (entrantType === "individual") eligible &&= !competitorSnap.exists
      || competitor.userId === userId && competitor.status === "payment_pending" && competitor.entryPaymentId === paymentId;
    else {
      const roster = Array.isArray(competitor.memberUserIds) ? competitor.memberUserIds.map(String) : [];
      const reservedRoster = Array.isArray(reservation.rosterUserIds) ? reservation.rosterUserIds.map(String) : [];
      eligible &&= competitor.tournamentId === tournamentId && competitor.captainUserId === userId && !competitor.slotReservedAt && competitor.paymentReservationId === reservationId
        && roster.length === reservedRoster.length && roster.every((member, index) => member === reservedRoster[index]);
      if (eligible) {
        const memberRefs = roster.map((memberId) => db.collection("tournamentTeamMemberships").doc(`${tournamentId}_${memberId}`));
        const memberSnaps = memberRefs.length ? await transaction.getAll(...memberRefs) : [];
        const memberAccounts = roster.length ? await transaction.getAll(...roster.map((memberId) => db.collection("users").doc(memberId))) : [];
        eligible &&= Boolean(tournament.teamConfig) && roster.length >= Number(tournament.teamConfig?.minimumSize) && roster.length <= Number(tournament.teamConfig?.maximumSize)
          && memberSnaps.every((snap, index) => snap.exists && snap.data()?.teamId === entrantId && snap.data()?.status === "active" && (roster[index] !== userId || snap.data()?.role === "captain"))
          && memberAccounts.every((account) => account.exists && accountEligible(account.data()));
      }
    }
    if (!eligible || competitorRows.size >= 501 || reservationRows.size >= 501) {
      const reason = !eligible ? ineligibleReason ?? "ELIGIBILITY_CHANGED_DURING_CHECKOUT" : "CAPACITY_RECONCILIATION_REQUIRED";
      const refundCaseId = deterministicId("refund_tournamentEntryPayments", paymentId);
      transaction.set(reservationRef, { status: "refund_required", outcomeReason: reason, updatedAt: now.toISOString() }, { merge: true });
      transaction.set(paymentRef, { status: "refund_required", refundStatus: "required", refundType: "mandatory_tournament_entry_reversal", refundReason: reason, providerPaymentIntentId: evidence.paymentIntent.id, providerChargeId: evidence.charge.id, providerPaidStateVerifiedAt: now.toISOString(), updatedAt: now.toISOString() }, { merge: true });
      transaction.set(db.collection("refundCases").doc(refundCaseId), { id: refundCaseId, paymentCollection: "tournamentEntryPayments", paymentId, tournamentId, userId, provider: "stripe", providerPaymentIntentId: evidence.paymentIntent.id, amountCents: session.amount_total, currency: session.currency, status: "required", refundType: "mandatory_tournament_entry_reversal", reason, createdAt: now.toISOString(), updatedAt: now.toISOString(), idempotencyKey: refundCaseId }, { merge: true });
      result = { handled: true, kind: "tournament_entry", status: "refund_required", reason, refundCaseId };
      return;
    }
    const competitors = competitorRows.docs.map((doc) => doc.data() ?? {}) as Array<Record<string, unknown>>;
    const confirmed = activeCount(competitors, entrantType as PaidEntryTarget["mode"]);
    const otherReservations = reservationRows.docs.map((doc) => doc.data() ?? {}).filter((row) => row.id !== reservationId && Date.parse(String(row.reservationExpiresAt ?? "")) > now.getTime());
    const reservationStillValid = reservation.status === "pending" && now.getTime() < reservationExpiresAt;
    const lateCanUseFreshSlot = confirmed + otherReservations.length < Number(tournament.participantCapacity);
    if (confirmed >= Number(tournament.participantCapacity) || (!reservationStillValid && !lateCanUseFreshSlot)) {
      const reason = reservationStillValid ? "CAPACITY_CHANGED_DURING_CHECKOUT" : "RESERVATION_EXPIRED_AND_CAPACITY_UNAVAILABLE";
      const refundCaseId = deterministicId("refund_tournamentEntryPayments", paymentId);
      transaction.set(reservationRef, { status: "refund_required", outcomeReason: reason, updatedAt: now.toISOString() }, { merge: true });
      transaction.set(paymentRef, { status: "refund_required", refundStatus: "required", refundType: "mandatory_tournament_entry_reversal", refundReason: reason, providerPaymentIntentId: evidence.paymentIntent.id, providerChargeId: evidence.charge.id, providerPaidStateVerifiedAt: now.toISOString(), updatedAt: now.toISOString() }, { merge: true });
      transaction.set(db.collection("refundCases").doc(refundCaseId), { id: refundCaseId, paymentCollection: "tournamentEntryPayments", paymentId, tournamentId, userId, provider: "stripe", providerPaymentIntentId: evidence.paymentIntent.id, amountCents: session.amount_total, currency: session.currency, status: "required", refundType: "mandatory_tournament_entry_reversal", reason, createdAt: now.toISOString(), updatedAt: now.toISOString(), idempotencyKey: refundCaseId }, { merge: true });
      result = { handled: true, kind: "tournament_entry", status: "refund_required", reason, refundCaseId };
      return;
    }
    if (entrantType === "individual") {
      if (competitorSnap.exists && competitor.status !== "withdrawn") throw new Error("Tournament participant already exists for this successful payment.");
      const participant = { id: entrantId, tournamentId, userId, status: "registered", checkInStatus: "pending", seed: null, inviteId: reservation.invitationId ?? null, waitlistPosition: null, entryPaymentId: paymentId, createdAt: String(reservation.reservationCreatedAt), updatedAt: now.toISOString() } satisfies TournamentParticipantFoundation & Record<string, unknown>;
      transaction.set(competitorRef, participant);
    } else {
    transaction.set(competitorRef, { status: "ready", paymentStatus: "confirmed", slotReservedAt: now.toISOString(), rosterLockedAt: now.toISOString(), paymentReservationId: null, paymentReservationExpiresAt: null, entryPaymentId: paymentId, readyAt: now.toISOString(), updatedAt: now.toISOString() }, { merge: true });
    }
    const count = confirmed + 1;
    const activationQueued = count === Number(tournament.participantCapacity);
    const activationVersion = Math.max(0, Number(tournament.activationVersion ?? 0)) + (activationQueued ? 1 : 0);
    const activationWindowEndsAt = activationQueued ? new Date(now.getTime() + 5_000).toISOString() : null;
    transaction.update(tournamentRef, {
      participantCount: count,
      firstConfirmedEntrantAt: tournament.firstConfirmedEntrantAt ?? now.toISOString(),
      timingLockedAt: tournament.timingLockedAt ?? now.toISOString(),
      ...(activationQueued ? { activationVersion, activationState: "provisional", activationWindowEndsAt, registrationFullAt: now.toISOString() } : {}),
      updatedAt: now.toISOString()
    });
    transaction.set(paymentRef, { status: "confirmed", webhookConfirmed: true, reservationStatus: "confirmed", providerPaymentIntentId: evidence.paymentIntent.id, providerChargeId: evidence.charge.id, confirmedAt: now.toISOString(), updatedAt: now.toISOString() }, { merge: true });
    transaction.set(reservationRef, { status: "confirmed", confirmedAt: now.toISOString(), lateConfirmation: !reservationStillValid, updatedAt: now.toISOString() }, { merge: true });
    transaction.set(lockRef, { activeReservationId: null, updatedAt: now.toISOString() }, { merge: true });
    transaction.create(db.collection("tournamentFinancialLedger").doc(`entry_${paymentId}`), { id: `entry_${paymentId}`, tournamentId, paymentId, participantId: entrantType === "individual" ? entrantId : null, teamId: entrantType === "team" ? entrantId : null, payerUserId: userId, amountCents: session.amount_total, currency: session.currency, status: "confirmed_entry_fee", provider: "stripe", providerSessionId: session.id, providerPaymentIntentId: evidence.paymentIntent.id, providerChargeId: evidence.charge.id, createdAt: now.toISOString(), idempotencyKey: paymentId });
    transaction.create(db.collection("tournamentAuditEvents").doc(`${paymentId}_confirmed`), { id: `${paymentId}_confirmed`, tournamentId, actorId: "stripe", action: "paid_tournament_entry_confirmed", createdAt: now.toISOString(), metadata: { entrantType, entrantId, lateConfirmation: !reservationStillValid, amountCents: session.amount_total, currency: session.currency } });
    if (activationQueued) {
      const jobId = `${tournamentId}_activation_v${activationVersion}`;
      activationJobId = jobId;
      transaction.set(db.collection("tournamentJobs").doc(jobId), { id: jobId, tournamentId, type: "activate_full_tournament", status: "pending", version: activationVersion, runAt: activationWindowEndsAt, schedulerDispatchState: "pending", schedulerDispatchAttempts: 0, createdAt: now.toISOString(), updatedAt: now.toISOString() }, { merge: true });
    }
    result = { handled: true, kind: "tournament_entry", status: "confirmed", participantId: entrantType === "individual" ? entrantId : null, teamId: entrantType === "team" ? entrantId : null, participantCount: count, activationQueued, lateConfirmation: !reservationStillValid };
  });
  if (activationJobId) {
    const dispatch = await dispatchTournamentActivationOutbox(db, activationJobId);
    result.schedulerDispatchStatus = dispatch.status;
  }
  return result;
}

export async function initiateTournamentEntryRefund(stripe: Stripe, db: Firestore, paymentId: string) {
  const paymentRef = db.collection("tournamentEntryPayments").doc(paymentId);
  const refundCaseId = deterministicId("refund_tournamentEntryPayments", paymentId);
  const refundRef = db.collection("refundCases").doc(refundCaseId);
  const now = new Date().toISOString();
  const details = await db.runTransaction(async (transaction) => {
    const [paymentSnap, refundSnap] = await Promise.all([transaction.get(paymentRef), transaction.get(refundRef)]);
    if (!paymentSnap.exists || !refundSnap.exists) throw new Error("Required Tournament refund records are missing.");
    const payment = paymentSnap.data() ?? {};
    const refund = refundSnap.data() ?? {};
    if (payment.status === "refunded" || refund.status === "succeeded") return { done: true as const };
    const eligibleRefundType = refund.refundType === "mandatory_tournament_entry_reversal"
      || refund.refundType === "ordinary_tournament_entry" && refund.approvedBeforeCutoff === true;
    if (refund.paymentCollection !== "tournamentEntryPayments" || !eligibleRefundType
      || !["required", "approved", "processing"].includes(String(refund.status))) {
      throw new Error("Tournament payment is not eligible for automatic mandatory refund processing.");
    }
    const paymentIntentId = String(payment.providerPaymentIntentId ?? "");
    if (!paymentIntentId) throw new Error("Tournament refund is waiting for a verified PaymentIntent.");
    transaction.set(paymentRef, { status: "refund_pending", refundPreviousPaymentStatus: payment.refundPreviousPaymentStatus ?? payment.status, refundStatus: "processing", refundType: refund.refundType, updatedAt: now }, { merge: true });
    transaction.set(refundRef, { status: "processing", providerPaymentIntentId: paymentIntentId, providerCallStartedAt: now, updatedAt: now }, { merge: true });
    return { done: false as const, paymentIntentId };
  });
  if (details.done) return { status: "refunded", idempotent: true };
  // Keep the provider request identical across webhook and Admin retries. A
  // retry after a timeout must reuse the same key and exact parameters.
  const refund = await stripe.refunds.create({ payment_intent: details.paymentIntentId, metadata: { refundCaseId } }, { idempotencyKey: `tournament-entry-refund-${paymentId}` });
  const status = refund.status === "succeeded" ? "succeeded" : ["failed", "canceled"].includes(String(refund.status)) ? "failed" : "processing";
  await reconcileTournamentEntryRefund(db, { refundCaseId, providerRefundId: refund.id, providerStatus: refund.status ?? "unknown", status, providerAmountCents: refund.amount, providerPaymentIntentId: typeof refund.payment_intent === "string" ? refund.payment_intent : refund.payment_intent?.id, providerCurrency: refund.currency, now: new Date(now) });
  return { status, providerRefundId: refund.id };
}

/** Persists provider disputes and freezes Tournament results/settlement until Admin reconciliation. */
export async function recordTournamentEntryDispute(db: Firestore, input: {
  dispute: Stripe.Dispute; charge: Stripe.Charge; paymentIntent: Stripe.PaymentIntent; eventId: string; eventType: string; now?: Date;
}) {
  const { dispute, charge, paymentIntent } = input;
  const now = input.now ?? new Date();
  const paymentIntentId = objectId(paymentIntent.id);
  const chargePaymentIntentId = objectId(charge.payment_intent);
  const disputeChargeId = objectId(dispute.charge);
  const disputePaymentIntentId = objectId(dispute.payment_intent);
  const intentLatestChargeId = objectId(paymentIntent.latest_charge);
  const paymentQuery = paymentIntentId
    ? await db.collection("tournamentEntryPayments").where("providerPaymentIntentId", "==", paymentIntentId).limit(2).get()
    : null;
  const reviewRef = db.collection("tournamentEntryDisputes").doc(String(dispute.id));
  if (!paymentQuery || paymentQuery.size !== 1) {
    const record = {
      id: String(dispute.id), provider: "stripe", eventId: input.eventId, eventType: input.eventType,
      providerStatus: String(dispute.status), disputeAmountCents: dispute.amount,
      currency: String(dispute.currency ?? "").toLowerCase(), chargeId: charge.id,
      paymentIntentId: paymentIntentId || null, paymentId: null, tournamentId: null,
      linkStatus: paymentQuery?.size ? "ambiguous_payment" : "unlinked_payment",
      reviewRequired: true, restrictionActive: true, createdAt: now.toISOString(), updatedAt: now.toISOString()
    };
    await reviewRef.set(record, { merge: true });
    return { handled: true, kind: "tournament_entry_dispute", linked: false, reviewRequired: true, linkStatus: record.linkStatus };
  }

  const paymentDoc = paymentQuery.docs[0];
  const paymentRef = paymentDoc.ref;
  const payment = paymentDoc.data();
  const tournamentId = String(payment.tournamentId ?? "");
  if (!tournamentId || !payment.entrantId || !payment.entrantType) throw new Error("Tournament dispute payment association is incomplete.");
  const tournamentRef = db.collection("tournaments").doc(tournamentId);
  const matchQuery = db.collection("tournamentMatches").where("tournamentId", "==", tournamentId).limit(490);
  const result = await db.runTransaction(async (transaction) => {
    const [latestPayment, tournamentSnap, matchesSnap, disputeSnap] = await Promise.all([
      transaction.get(paymentRef), transaction.get(tournamentRef), transaction.get(matchQuery), transaction.get(reviewRef)
    ]);
    if (!latestPayment.exists || !tournamentSnap.exists || matchesSnap.size >= 490) throw new Error("Tournament dispute requires manual financial reconciliation.");
    const currentPayment = latestPayment.data() ?? {};
    if (currentPayment.providerPaymentIntentId !== paymentIntentId) throw new Error("Tournament dispute PaymentIntent changed during verification.");
    const providerMatches = disputeChargeId === charge.id
      && disputePaymentIntentId === paymentIntentId
      && chargePaymentIntentId === paymentIntentId
      && intentLatestChargeId === charge.id
      && Number.isSafeInteger(dispute.amount) && dispute.amount > 0 && dispute.amount <= Number(charge.amount)
      && Number(charge.amount) === Number(currentPayment.amountCents)
      && String(dispute.currency ?? "").toLowerCase() === String(charge.currency).toLowerCase()
      && String(charge.currency).toLowerCase() === String(currentPayment.currency ?? "").toLowerCase();
    const matchIds: string[] = [];
    for (const match of matchesSnap.docs) {
      const data = match.data();
      if (data.participantAId !== currentPayment.entrantId && data.participantBId !== currentPayment.entrantId) continue;
      matchIds.push(match.id);
      transaction.set(match.ref, {
        financialHold: true,
        financialHoldReason: "TOURNAMENT_ENTRY_PAYMENT_DISPUTED",
        financialHoldPaymentId: paymentDoc.id,
        financialHoldDisputeId: dispute.id,
        financialHoldAt: now.toISOString(),
        updatedAt: now.toISOString()
      }, { merge: true });
    }
    const previous = disputeSnap.data() ?? {};
    transaction.set(reviewRef, {
      id: String(dispute.id), provider: "stripe", eventId: input.eventId, eventType: input.eventType,
      paymentId: paymentDoc.id, tournamentId, entrantId: String(currentPayment.entrantId),
      entrantType: String(currentPayment.entrantType), reservationId: paymentDoc.id,
      agreementId: null, chargeId: charge.id, paymentIntentId,
      providerStatus: String(dispute.status), providerOutcome: ["won", "lost"].includes(String(dispute.status)) ? String(dispute.status) : null,
      disputeAmountCents: dispute.amount, paymentAmountCents: Number(currentPayment.amountCents),
      currency: String(dispute.currency ?? "").toLowerCase(), providerReferencesVerified: providerMatches,
      linkStatus: providerMatches ? "verified" : "provider_reference_mismatch",
      affectedMatchIds: matchIds, reviewRequired: true, restrictionActive: true,
      adminReconciliationStatus: previous.adminReconciliationStatus ?? "required",
      eventIds: Array.from(new Set([...(Array.isArray(previous.eventIds) ? previous.eventIds : []), input.eventId])).slice(-100),
      createdAt: previous.createdAt ?? now.toISOString(), updatedAt: now.toISOString()
    }, { merge: true });
    transaction.set(paymentRef, {
      financialRestriction: "stripe_dispute",
      stripeDisputeRestricted: true,
      stripeDisputeReviewRequired: true,
      stripeDisputeIds: FieldValue.arrayUnion(String(dispute.id)),
      updatedAt: now.toISOString()
    }, { merge: true });
    transaction.set(tournamentRef, {
      financialHold: true, financialHoldReason: "TOURNAMENT_ENTRY_PAYMENT_DISPUTED",
      financialHoldPaymentId: paymentDoc.id, financialHoldDisputeId: String(dispute.id),
      financialHoldAt: now.toISOString(), updatedAt: now.toISOString()
    }, { merge: true });
    transaction.set(db.collection("tournamentSettlementHolds").doc(`${tournamentId}_${paymentDoc.id}`), {
      id: `${tournamentId}_${paymentDoc.id}`, tournamentId, paymentId: paymentDoc.id,
      entrantId: String(currentPayment.entrantId), entrantType: String(currentPayment.entrantType),
      disputeId: String(dispute.id), affectedMatchIds: matchIds,
      reason: "TOURNAMENT_ENTRY_PAYMENT_DISPUTED", status: "pending_admin_review",
      completedPayoutsPreserved: true, automaticDebitExecuted: false,
      createdAt: previous.createdAt ?? now.toISOString(), updatedAt: now.toISOString()
    }, { merge: true });
    transaction.set(db.collection("tournamentAuditEvents").doc(`${paymentDoc.id}_dispute_${dispute.id}`), {
      id: `${paymentDoc.id}_dispute_${dispute.id}`, tournamentId, actorId: "stripe",
      action: "tournament_entry_payment_disputed", createdAt: now.toISOString(),
      metadata: { paymentId: paymentDoc.id, disputeId: String(dispute.id), eventId: input.eventId, eventType: input.eventType, providerReferencesVerified: providerMatches, disputeAmountCents: dispute.amount, paymentAmountCents: currentPayment.amountCents }
    }, { merge: true });
    return { linked: true, reviewRequired: true, providerReferencesVerified: providerMatches, tournamentId, paymentId: paymentDoc.id, affectedMatchIds: matchIds };
  });
  return { handled: true, kind: "tournament_entry_dispute", ...result };
}

/** Reconciles only a provider-confirmed full refund; completed result/payout history is retained and affected bracket state is held. */
export async function reconcileTournamentEntryRefund(db: Firestore, input: {
  refundCaseId: string; providerRefundId: string; providerStatus: string; status: "succeeded" | "failed" | "processing";
  providerAmountCents?: number; providerPaymentIntentId?: string | null; providerCurrency?: string | null; now?: Date;
}) {
  const now = input.now ?? new Date();
  const refundRef = db.collection("refundCases").doc(input.refundCaseId);
  const initialRefund = await refundRef.get();
  if (!initialRefund.exists || initialRefund.data()?.paymentCollection !== "tournamentEntryPayments") throw new Error("Tournament refund case is missing or linked to another payment type.");
  const paymentId = String(initialRefund.data()?.paymentId ?? "");
  const paymentRef = db.collection("tournamentEntryPayments").doc(paymentId);
  const result = await db.runTransaction(async (transaction) => {
    const [refundSnap, paymentSnap] = await Promise.all([transaction.get(refundRef), transaction.get(paymentRef)]);
    if (!refundSnap.exists || !paymentSnap.exists) throw new Error("Tournament refund/payment record is missing.");
    const refund = refundSnap.data() ?? {};
    const payment = paymentSnap.data() ?? {};
    if (refund.status === "succeeded" && payment.status === "refunded") return { idempotent: true, tournamentId: String(payment.tournamentId ?? ""), entrantId: String(payment.entrantId ?? ""), entrantType: String(payment.entrantType ?? ""), wasConfirmed: Boolean(payment.refundPreviousPaymentStatus === "confirmed" || payment.confirmedAt) };
    const tournamentId = String(payment.tournamentId ?? refund.tournamentId ?? "");
    const entrantId = String(payment.entrantId ?? "");
    const entrantType = String(payment.entrantType ?? "");
    const paymentIntentId = String(payment.providerPaymentIntentId ?? refund.providerPaymentIntentId ?? "");
    if (!tournamentId || !entrantId || !["individual", "team"].includes(entrantType) || !paymentIntentId) throw new Error("Tournament refund linkage is incomplete.");
    if (Number(refund.amountCents) !== Number(payment.amountCents) || Number(refund.fullRefundAmountCents ?? refund.amountCents) !== Number(payment.amountCents)) throw new Error("Tournament entry refunds must match the complete valid entry fee.");
    const tournamentRef = db.collection("tournaments").doc(tournamentId);
    const competitorRef = db.collection(entrantType === "team" ? "tournamentTeams" : "tournamentParticipants").doc(entrantId);
    const matchesQuery = db.collection("tournamentMatches").where("tournamentId", "==", tournamentId).limit(490);
    const [tournamentSnap, competitorSnap, matchesSnap] = await Promise.all([transaction.get(tournamentRef), transaction.get(competitorRef), transaction.get(matchesQuery)]);
    if (!tournamentSnap.exists || matchesSnap.size >= 490) throw new Error("Tournament refund requires manual bracket reconciliation.");
    const providerMismatch = input.providerAmountCents !== undefined && input.providerAmountCents !== Number(payment.amountCents)
      || input.providerPaymentIntentId !== undefined && input.providerPaymentIntentId !== paymentIntentId
      || input.providerCurrency !== undefined && String(input.providerCurrency ?? "").toLowerCase() !== String(payment.currency ?? "").toLowerCase();
    if (providerMismatch) {
      const affectedMatchIds: string[] = [];
      for (const match of matchesSnap.docs) {
        const matchData = match.data();
        if (matchData.participantAId !== entrantId && matchData.participantBId !== entrantId) continue;
        affectedMatchIds.push(match.id);
        transaction.set(match.ref, { financialHold: true, financialHoldReason: "TOURNAMENT_ENTRY_REFUND_MISMATCH", financialHoldPaymentId: paymentId, financialHoldAt: now.toISOString(), updatedAt: now.toISOString() }, { merge: true });
      }
      transaction.set(refundRef, { status: "review_required", providerRefundId: input.providerRefundId, providerStatus: input.providerStatus, providerAmountCents: input.providerAmountCents ?? null, providerPaymentIntentId: input.providerPaymentIntentId ?? null, providerCurrency: input.providerCurrency ?? null, reviewReason: "STRIPE_REFUND_REFERENCE_OR_AMOUNT_MISMATCH", updatedAt: now.toISOString() }, { merge: true });
      transaction.set(paymentRef, { status: "refund_review_required", refundStatus: "review_required", financialRestriction: "refund_provider_mismatch", updatedAt: now.toISOString() }, { merge: true });
      transaction.set(tournamentRef, { financialHold: true, financialHoldReason: "TOURNAMENT_ENTRY_REFUND_MISMATCH", financialHoldPaymentId: paymentId, financialHoldAt: now.toISOString(), updatedAt: now.toISOString() }, { merge: true });
      transaction.set(db.collection("tournamentSettlementHolds").doc(`${tournamentId}_${paymentId}`), { id: `${tournamentId}_${paymentId}`, tournamentId, paymentId, entrantId, entrantType, affectedMatchIds, reason: "TOURNAMENT_ENTRY_REFUND_MISMATCH", status: "pending_admin_review", providerRefundId: input.providerRefundId, createdAt: now.toISOString(), updatedAt: now.toISOString() }, { merge: true });
      return { idempotent: false, tournamentId, entrantId, entrantType, wasConfirmed: Boolean(payment.confirmedAt), reviewRequired: true };
    }
    const status = input.status;
    const previouslyConfirmed = payment.status === "confirmed" || payment.refundPreviousPaymentStatus === "confirmed" || Boolean(payment.confirmedAt);
    transaction.set(refundRef, { status, providerRefundId: input.providerRefundId, providerStatus: input.providerStatus, providerCallCompletedAt: now.toISOString(), updatedAt: now.toISOString() }, { merge: true });
    if (status !== "succeeded") {
      const restoredStatus = status === "processing" ? "refund_pending" : payment.refundPreviousPaymentStatus === "confirmed" || payment.confirmedAt ? "confirmed" : String(payment.refundPreviousPaymentStatus ?? "refund_required");
      transaction.set(paymentRef, { status: restoredStatus, refundStatus: status, providerRefundId: input.providerRefundId, updatedAt: now.toISOString() }, { merge: true });
      return { idempotent: false, tournamentId, entrantId, entrantType, wasConfirmed: false };
    }
    transaction.set(paymentRef, { status: "refunded", refundStatus: "succeeded", providerRefundId: input.providerRefundId, refundedAt: now.toISOString(), updatedAt: now.toISOString() }, { merge: true });
    transaction.set(db.collection("tournamentEntryReservations").doc(paymentId), { status: "refunded", refundedAt: now.toISOString(), updatedAt: now.toISOString() }, { merge: true });
    transaction.set(db.collection("cashLedger").doc(`refund_${input.refundCaseId}`), { id: `refund_${input.refundCaseId}`, transactionType: "refund", sourceType: "tournament_entry", sourceId: paymentId, amountCents: Number(payment.amountCents), currency: payment.currency, direction: "debit", status: "posted", immutable: true, providerReference: input.providerRefundId, idempotencyKey: input.refundCaseId, tournamentId, createdAt: now.toISOString(), updatedAt: now.toISOString() }, { merge: true });
    if (previouslyConfirmed && competitorSnap.exists) {
      const competitor = competitorSnap.data() ?? {};
      const currentCount = Math.max(0, Number(tournamentSnap.data()?.participantCount ?? 0));
      const matchIds: string[] = [];
      for (const match of matchesSnap.docs) {
        const matchData = match.data();
        if (matchData.participantAId !== entrantId && matchData.participantBId !== entrantId) continue;
        matchIds.push(match.id);
        transaction.set(match.ref, { financialHold: true, financialHoldReason: "TOURNAMENT_ENTRY_PAYMENT_REVERSED", financialHoldPaymentId: paymentId, financialHoldAt: now.toISOString(), updatedAt: now.toISOString() }, { merge: true });
      }
      transaction.set(competitorRef, entrantType === "team"
        ? { status: "withdrawn", paymentStatus: "refunded", withdrawnAt: now.toISOString(), withdrawalReason: "ENTRY_PAYMENT_REFUNDED", updatedAt: now.toISOString() }
        : { status: "withdrawn", withdrawnAt: now.toISOString(), withdrawalReason: "ENTRY_PAYMENT_REFUNDED", updatedAt: now.toISOString() }, { merge: true });
      transaction.set(tournamentRef, { participantCount: Math.max(0, currentCount - 1), financialHold: true, financialHoldReason: "TOURNAMENT_ENTRY_PAYMENT_REVERSED", financialHoldAt: now.toISOString(), updatedAt: now.toISOString() }, { merge: true });
      transaction.set(db.collection("tournamentSettlementHolds").doc(`${tournamentId}_${paymentId}`), { id: `${tournamentId}_${paymentId}`, tournamentId, paymentId, entrantId, entrantType, affectedMatchIds: matchIds, reason: "TOURNAMENT_ENTRY_PAYMENT_REVERSED", status: "pending_admin_review", createdAt: now.toISOString(), updatedAt: now.toISOString() }, { merge: true });
      transaction.set(db.collection("tournamentAuditEvents").doc(`${paymentId}_refunded`), { id: `${paymentId}_refunded`, tournamentId, actorId: "stripe", action: "tournament_entry_refunded_and_held", createdAt: now.toISOString(), metadata: { refundCaseId: input.refundCaseId, providerRefundId: input.providerRefundId, entrantId, entrantType, affectedMatchIds: matchIds } }, { merge: true });
    }
    return { idempotent: false, tournamentId, entrantId, entrantType, wasConfirmed: previouslyConfirmed };
  });
  return result;
}
