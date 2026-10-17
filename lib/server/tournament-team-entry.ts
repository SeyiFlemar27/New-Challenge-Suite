import { FieldValue, type Firestore, type Transaction } from "firebase-admin/firestore";
import { createHash } from "node:crypto";
import type Stripe from "stripe";
import { deterministicId } from "@/lib/server/idempotency";
import { TOURNAMENT_PRODUCT_POLICY, TOURNAMENT_TEAM_PAYMENT_WINDOWS } from "@/lib/tournament-builder-policy";
import { dispatchTournamentActivationOutbox } from "@/lib/server/tournament-cloud-tasks";
import { assertPaidEntryProviderEvidence, type ProviderEvidence } from "@/lib/server/tournament-entry-provider";
import { deliverTournamentNotifications } from "@/lib/server/tournament-notifications";

type Row = Record<string, unknown>;
const error = (message: string, code: string, status = 409) => Object.assign(new Error(message), { code, status });
const eligible = (account: Row | undefined) => Boolean(account) && !account?.disabled && !account?.suspended
  && !["disabled", "suspended", "deactivated", "blocked", "deleted", "deletion_requested", "anonymized"].includes(String(account?.accountStatus ?? "active"))
  && !["sponsor", "enterprise"].includes(String(account?.accountType ?? account?.role ?? "user"));
const strings = (value: unknown): string[] => Array.isArray(value) ? value.filter((item): item is string => typeof item === "string" && Boolean(item)) : [];
// Keep IDs below safeIdPart's legacy truncation threshold; retain every source byte in the hash.
const compactId = (prefix: string, ...parts: unknown[]) => `${prefix}_${createHash("sha256").update(JSON.stringify(parts)).digest("hex")}`;
const terminal = (payment: Row) => ["refunded", "refund_pending", "refund_review_required", "refund_required"].includes(String(payment.status));

function stageMemberReview(db: Firestore, transaction: Transaction, payment: Row, reason: string, now: string, evidence?: ProviderEvidence) {
  if (terminal(payment)) return;
  const paymentId = String(payment.id);
  const intent = evidence?.paymentIntent.id ?? payment.providerPaymentIntentId;
  const charge = evidence?.charge.id ?? payment.providerChargeId;
  if (!intent || (!evidence && payment.webhookConfirmed !== true)) {
    transaction.set(db.collection("tournamentEntryPayments").doc(paymentId), { status: "expired", reservationStatus: "expired", updatedAt: now }, { merge: true });
    transaction.set(db.collection("tournamentEntryReservations").doc(paymentId), { status: "expired", updatedAt: now }, { merge: true });
    return;
  }
  const caseId = deterministicId("refund_tournamentEntryPayments", paymentId);
  transaction.set(db.collection("tournamentEntryPayments").doc(paymentId), { status: "refund_review_required", webhookConfirmed: true, financialRestriction: reason, refundStatus: "pending_review", refundReason: reason, providerPaymentIntentId: intent, providerChargeId: charge ?? null, updatedAt: now }, { merge: true });
  transaction.set(db.collection("tournamentEntryReservations").doc(paymentId), { status: "refund_review_required", outcomeReason: reason, updatedAt: now }, { merge: true });
  if (["member_confirmed", "confirmed", "paid"].includes(String(payment.status))) {
    transaction.set(db.collection("tournamentFinancialLedger").doc(`entry_${paymentId}`), { status: "refund_review_required", financialRestriction: reason, refundCaseId: caseId, updatedAt: now }, { merge: true });
  }
  transaction.create(db.collection("refundCases").doc(caseId), { id: caseId, paymentCollection: "tournamentEntryPayments", paymentId, tournamentId: payment.tournamentId, teamId: payment.teamId, teamAttemptId: payment.teamAttemptId, userId: payment.userId, provider: "stripe", providerPaymentIntentId: intent, amountCents: payment.amountCents, fullRefundAmountCents: payment.amountCents, currency: payment.currency, status: "pending_review", refundType: "mandatory_tournament_entry_reversal", reason, idempotencyKey: caseId, createdAt: now, updatedAt: now });
}

/** One temporary slot per team attempt; one independently payable record per consenting member. */
export async function reserveTournamentTeamMemberEntry(db: Firestore, input: { tournamentId: string; teamId: string; userId: string; rulesAccepted: boolean; now?: Date }) {
  const now = input.now ?? new Date();
  if (!input.rulesAccepted) throw error("Accept the Tournament rules before payment.", "RULES_REQUIRED", 422);
  const teamRef = db.collection("tournamentTeams").doc(input.teamId);
  const before = await teamRef.get();
  if (before.data()?.tournamentId !== input.tournamentId || !strings(before.data()?.memberUserIds).includes(input.userId)) throw error("Active team membership is required.", "TEAM_MEMBERSHIP_REQUIRED", 403);
  if (before.data()?.activeRegistrationAttemptId && Date.parse(String(before.data()?.paymentReservationExpiresAt)) <= now.getTime()) {
    await expireTournamentTeamAttempt(db, String(before.data()?.activeRegistrationAttemptId), now);
  }
  let dispatchJobId: string | null = null;
  const reservation = await db.runTransaction(async transaction => {
    const tournamentRef = db.collection("tournaments").doc(input.tournamentId);
    const [tournamentSnap, teamSnap, pending] = await Promise.all([
      transaction.get(tournamentRef), transaction.get(teamRef),
      transaction.get(db.collection("tournamentTeamRegistrationAttempts").where("tournamentId", "==", input.tournamentId).where("status", "==", "pending"))
    ]);
    const tournament = tournamentSnap.data() ?? {};
    const team = teamSnap.data() ?? {};
    if (!tournamentSnap.exists || !teamSnap.exists || team.tournamentId !== input.tournamentId) throw error("Tournament team not found.", "TOURNAMENT_TEAM_NOT_FOUND", 404);
    if (tournament.productPolicyVersion !== TOURNAMENT_PRODUCT_POLICY || tournament.participationMode !== "team" || tournament.entryType === "free") throw error("Per-member paid registration is not configured.", "TEAM_PAYMENT_MODEL_MISMATCH");
    if (tournament.status !== "registration_open" || tournament.paymentActivationEnabled !== true || tournament.financialHold) throw error("Tournament entry payments are unavailable.", "TOURNAMENT_PAYMENT_DISABLED");
    if (team.slotReservedAt || ["ready", "checked_in", "active"].includes(String(team.status))) throw error("This team is already registered.", "TEAM_ALREADY_REGISTERED");
    const roster = strings(team.memberUserIds);
    const config = tournament.teamConfig ?? {};
    if (!roster.includes(input.userId) || input.userId === tournament.hostId) throw error("Active team membership is required.", "TEAM_MEMBERSHIP_REQUIRED", 403);
    if (new Set(roster).size !== roster.length || roster.length < Number(config.minimumSize) || roster.length > Number(config.maximumSize) || roster.length > 20) throw error("Complete a valid team roster first.", "TEAM_ROSTER_INVALID", 422);
    const [accounts, memberships] = await Promise.all([
      transaction.getAll(...roster.map(id => db.collection("users").doc(id))),
      transaction.getAll(...roster.map(id => db.collection("tournamentTeamMemberships").doc(`${input.tournamentId}_${id}`)))
    ]);
    if (roster.some((id, index) => !eligible(accounts[index].data()) || memberships[index].data()?.teamId !== input.teamId || memberships[index].data()?.status !== "active"
      || (id === team.captainUserId && memberships[index].data()?.role !== "captain"))) throw error("Every member must have valid, consenting membership and an eligible account.", "TEAM_MEMBER_REVALIDATION_FAILED", 403);
    let attemptId = String(team.activeRegistrationAttemptId ?? "");
    const existing = attemptId ? await transaction.get(db.collection("tournamentTeamRegistrationAttempts").doc(attemptId)) : null;
    let attempt = existing?.data();
    let payment: Row;
    if (attempt?.status === "pending" && Date.parse(String(attempt.expiresAt)) > now.getTime()) {
      if (JSON.stringify(strings(attempt.rosterUserIds)) !== JSON.stringify(roster)) throw error("The locked roster changed and requires review.", "TEAM_ROSTER_CHANGED");
      const paymentId = compactId("tmember", attemptId, input.userId);
      const paymentSnap = await transaction.get(db.collection("tournamentEntryPayments").doc(paymentId));
      if (!paymentSnap.exists) throw error("The member payment record requires review.", "TEAM_PAYMENT_RECORD_MISSING");
      payment = paymentSnap.data() ?? {};
      if (payment.status !== "pending") throw error("Your payment is already confirmed or being reconciled. Refresh the team.", "TEAM_MEMBER_PAYMENT_ALREADY_HANDLED");
    } else {
      if (team.captainUserId !== input.userId) throw error("The captain must start the team's registration attempt.", "TEAM_CAPTAIN_REQUIRED", 403);
      const confirmed = Number(tournament.participantCount ?? 0);
      const active = pending.docs.filter(doc => Date.parse(String(doc.data().expiresAt)) > now.getTime()).length;
      if (!Number.isSafeInteger(confirmed) || confirmed < 0 || confirmed + active >= Number(tournament.participantCapacity)) throw error("Every bracket slot is registered or temporarily reserved.", "TOURNAMENT_CAPACITY_REACHED");
      const minutes = Number(tournament.teamPaymentWindowMinutes ?? 60);
      const amountCents = Number(tournament.entryFeeAmountMinor);
      if (!TOURNAMENT_TEAM_PAYMENT_WINDOWS.includes(minutes as 30 | 60 | 90 | 120) || !Number.isSafeInteger(amountCents) || amountCents < 500 || String(tournament.currency).toUpperCase() !== "USD") throw error("Tournament team entry configuration is invalid.", "TOURNAMENT_ENTRY_PRICE_INVALID", 422);
      const version = Number(team.registrationAttemptVersion ?? 0) + 1;
      attemptId = compactId("tteam", input.tournamentId, input.teamId, version);
      const expiresAt = new Date(now.getTime() + minutes * 60_000).toISOString();
      const paymentIds = roster.map(id => compactId("tmember", attemptId, id));
      attempt = { id: attemptId, tournamentId: input.tournamentId, teamId: input.teamId, captainUserId: team.captainUserId, rosterUserIds: roster, paymentIds, amountCents, currency: "usd", status: "pending", createdAt: now.toISOString(), expiresAt, version };
      payment = {};
      roster.forEach((userId, index) => {
        const record = { id: paymentIds[index], tournamentId: input.tournamentId, teamId: input.teamId, entrantId: input.teamId, entrantType: "team", userId, teamAttemptId: attemptId, amountCents, currency: "usd", status: "pending", paymentPurpose: "tournament_entry", provider: "stripe", webhookConfirmed: false, refundStatus: "not_required", providerSessionId: null, providerPaymentIntentId: null, reservationCreatedAt: now.toISOString(), reservationExpiresAt: expiresAt, createdAt: now.toISOString(), updatedAt: now.toISOString() };
        transaction.create(db.collection("tournamentEntryPayments").doc(record.id), record);
        transaction.create(db.collection("tournamentEntryReservations").doc(record.id), record);
        if (userId === input.userId) payment = record;
      });
      transaction.create(db.collection("tournamentTeamRegistrationAttempts").doc(attemptId), attempt);
      transaction.update(teamRef, { activeRegistrationAttemptId: attemptId, latestRegistrationAttemptId: attemptId, registrationAttemptVersion: version, paymentReservationId: attemptId, paymentReservationExpiresAt: expiresAt, paymentStatus: "pending", updatedAt: now.toISOString() });
      transaction.update(tournamentRef, { paidEntryReservationVersion: FieldValue.increment(1), updatedAt: now.toISOString() });
      dispatchJobId = `${attemptId}_expiry`;
      transaction.create(db.collection("tournamentJobs").doc(dispatchJobId), { id: dispatchJobId, tournamentId: input.tournamentId, teamAttemptId: attemptId, type: "expire_team_registration", status: "pending", version: 1, runAt: expiresAt, schedulerDispatchState: "pending", schedulerDispatchAttempts: 0, createdAt: now.toISOString(), updatedAt: now.toISOString() });
      transaction.create(db.collection("tournamentAuditEvents").doc(`${attemptId}_created`), { id: `${attemptId}_created`, tournamentId: input.tournamentId, actorId: input.userId, action: "team_member_payment_attempt_started", createdAt: now.toISOString(), metadata: { teamId: input.teamId, attemptId, rosterUserIds: roster, expiresAt } });
    }
    return { reservationId: String(payment.id), paymentId: String(payment.id), teamAttemptId: attemptId, expiresAt: String(attempt.expiresAt), amountCents: Number(payment.amountCents), currency: String(payment.currency), checkoutSessionId: typeof payment.providerSessionId === "string" ? payment.providerSessionId : null, checkoutUrl: typeof payment.checkoutUrl === "string" ? payment.checkoutUrl : null, existing: Boolean(existing?.exists) };
  });
  if (dispatchJobId) await dispatchTournamentActivationOutbox(db, dispatchJobId);
  return reservation;
}

/** Expiry releases the temporary slot; successful charges stay visible in canonical review. */
export async function expireTournamentTeamAttempt(db: Firestore, attemptId: string, now = new Date(), reversalReason?: "TEAM_MEMBER_PAYMENT_REVERSED") {
  return db.runTransaction(async transaction => {
    const attemptRef = db.collection("tournamentTeamRegistrationAttempts").doc(attemptId);
    const snapshot = await transaction.get(attemptRef);
    const attempt = snapshot.data() ?? {};
    if (!snapshot.exists || attempt.status !== "pending") return { status: "skipped", code: "ATTEMPT_ALREADY_HANDLED" };
    if (!reversalReason && Date.parse(String(attempt.expiresAt)) > now.getTime()) return { status: "not_due", code: "ATTEMPT_NOT_DUE" };
    const paymentRefs = strings(attempt.paymentIds).map(id => db.collection("tournamentEntryPayments").doc(id));
    const teamRef = db.collection("tournamentTeams").doc(String(attempt.teamId));
    const tournamentRef = db.collection("tournaments").doc(String(attempt.tournamentId));
    const [payments, team, tournament] = await Promise.all([transaction.getAll(...paymentRefs), transaction.get(teamRef), transaction.get(tournamentRef)]);
    if (!tournament.exists) { transaction.update(attemptRef, { status: "review_required", reason: "TOURNAMENT_MISSING", updatedAt: now.toISOString() }); return { status: "held", code: "TOURNAMENT_MISSING" }; }
    payments.forEach(payment => { if (payment.exists) stageMemberReview(db, transaction, { id: payment.id, ...payment.data() }, reversalReason ?? "TEAM_REGISTRATION_WINDOW_EXPIRED", now.toISOString()); });
    transaction.update(attemptRef, { status: reversalReason ? "failed" : "expired", outcomeReason: reversalReason ?? "TEAM_REGISTRATION_WINDOW_EXPIRED", endedAt: now.toISOString(), ...(!reversalReason ? { expiredAt: now.toISOString() } : {}), updatedAt: now.toISOString() });
    if (team.data()?.activeRegistrationAttemptId === attemptId) transaction.update(teamRef, { activeRegistrationAttemptId: null, paymentReservationId: null, paymentReservationExpiresAt: null, paymentStatus: "review_required", updatedAt: now.toISOString() });
    transaction.set(tournamentRef, { paidEntryReservationVersion: FieldValue.increment(1), updatedAt: now.toISOString() }, { merge: true });
    transaction.set(db.collection("tournamentAuditEvents").doc(`${attemptId}_expired`), { id: `${attemptId}_expired`, tournamentId: attempt.tournamentId, actorId: "system_tournament_lifecycle", action: reversalReason ? "team_registration_failed" : "team_registration_expired", createdAt: now.toISOString(), metadata: { teamId: attempt.teamId, attemptId, reason: reversalReason ?? "TEAM_REGISTRATION_WINDOW_EXPIRED" } });
    return { status: reversalReason ? "failed" : "expired", code: reversalReason ?? "TEAM_REGISTRATION_WINDOW_EXPIRED" };
  });
}

export async function confirmTournamentTeamMemberPayment(db: Firestore, session: Stripe.Checkout.Session, evidence: ProviderEvidence, now = new Date()): Promise<Record<string, unknown>> {
  assertPaidEntryProviderEvidence(session, evidence);
  const paymentId = String(session.metadata?.paymentId ?? "");
  let activationJobId: string | null = null;
  const result = await db.runTransaction(async transaction => {
    const paymentRef = db.collection("tournamentEntryPayments").doc(paymentId);
    const paymentSnap = await transaction.get(paymentRef);
    const payment = { id: paymentId, ...paymentSnap.data() } as Row;
    if (!paymentSnap.exists || !payment.teamAttemptId || session.metadata?.entrantType !== "team" || session.metadata?.reservationId !== paymentId || session.metadata?.teamAttemptId !== payment.teamAttemptId
      || session.metadata?.tournamentId !== payment.tournamentId || session.metadata?.entrantId !== payment.teamId || session.metadata?.userId !== payment.userId
      || payment.providerSessionId !== session.id || payment.amountCents !== session.amount_total || String(payment.currency).toLowerCase() !== session.currency) throw error("Team payment does not match its reservation.", "TEAM_PAYMENT_REFERENCE_MISMATCH");
    if (terminal(payment) || (payment.webhookConfirmed === true && ["member_confirmed", "confirmed"].includes(String(payment.status)))) return { handled: true, kind: "tournament_entry", status: String(payment.status), duplicate: true };
    const attemptRef = db.collection("tournamentTeamRegistrationAttempts").doc(String(payment.teamAttemptId));
    const tournamentRef = db.collection("tournaments").doc(String(payment.tournamentId));
    const teamRef = db.collection("tournamentTeams").doc(String(payment.teamId));
    const [attemptSnap, tournamentSnap, teamSnap] = await Promise.all([transaction.get(attemptRef), transaction.get(tournamentRef), transaction.get(teamRef)]);
    const attempt = attemptSnap.data() ?? {}, tournament = tournamentSnap.data() ?? {}, team = teamSnap.data() ?? {};
    const roster = strings(attempt.rosterUserIds);
    if (!attemptSnap.exists || attempt.tournamentId !== payment.tournamentId || attempt.teamId !== payment.teamId || !roster.includes(String(payment.userId)) || !strings(attempt.paymentIds).includes(paymentId)) throw error("Team payment association is invalid.", "TEAM_PAYMENT_REFERENCE_MISMATCH");
    const [payments, memberships, accounts] = await Promise.all([
      transaction.getAll(...strings(attempt.paymentIds).map(id => db.collection("tournamentEntryPayments").doc(id))),
      transaction.getAll(...roster.map(id => db.collection("tournamentTeamMemberships").doc(`${payment.tournamentId}_${id}`))),
      transaction.getAll(...roster.map(id => db.collection("users").doc(id)))
    ]);
    const confirmedCount = Number(tournament.participantCount ?? 0);
    const valid = tournamentSnap.exists && teamSnap.exists && tournament.productPolicyVersion === TOURNAMENT_PRODUCT_POLICY
      && tournament.status === "registration_open" && tournament.paymentActivationEnabled === true && !tournament.financialHold && !team.slotReservedAt
      && attempt.status === "pending" && now.getTime() < Date.parse(String(attempt.expiresAt))
      && team.activeRegistrationAttemptId === attempt.id && team.captainUserId === attempt.captainUserId && JSON.stringify(strings(team.memberUserIds)) === JSON.stringify(roster)
      && payments.length === roster.length && payments.every(document => document.exists && document.data()?.teamAttemptId === attempt.id && document.data()?.tournamentId === payment.tournamentId && roster.includes(String(document.data()?.userId)))
      && Number(payment.amountCents) === Number(tournament.entryFeeAmountMinor)
      && Number.isSafeInteger(confirmedCount) && confirmedCount >= 0 && confirmedCount < Number(tournament.participantCapacity)
      && roster.every((id, index) => eligible(accounts[index].data()) && memberships[index].data()?.teamId === payment.teamId && memberships[index].data()?.status === "active");
    if (!valid) {
      // Arrival after the window cannot prove on-time completion. Preserve and review all paid funds.
      payments.forEach(document => { if (document.exists) stageMemberReview(db, transaction, { id: document.id, ...document.data() }, "TEAM_PAYMENT_REQUIRES_RECONCILIATION", now.toISOString(), document.id === paymentId ? evidence : undefined); });
      if (attempt.status === "pending") transaction.update(attemptRef, { status: "review_required", updatedAt: now.toISOString() });
      if (team.activeRegistrationAttemptId === attempt.id) transaction.update(teamRef, { activeRegistrationAttemptId: null, paymentReservationId: null, paymentReservationExpiresAt: null, paymentStatus: "review_required", updatedAt: now.toISOString() });
      transaction.set(db.collection("tournamentAuditEvents").doc(`${paymentId}_review`), { id: `${paymentId}_review`, tournamentId: payment.tournamentId, actorId: "stripe", action: "team_entry_payment_review_required", createdAt: now.toISOString(), metadata: { paymentId, attemptId: attempt.id } });
      return { handled: true, kind: "tournament_entry", status: "refund_review_required", duplicate: false };
    }
    const allPaid = payments.every(document => document.id === paymentId || (document.data()?.status === "member_confirmed" && document.data()?.webhookConfirmed === true && !document.data()?.financialRestriction));
    const confirmedAt = now.toISOString();
    transaction.update(paymentRef, { status: allPaid ? "confirmed" : "member_confirmed", webhookConfirmed: true, providerPaymentIntentId: evidence.paymentIntent.id, providerChargeId: evidence.charge.id, confirmedAt, ...(allPaid ? { teamRegistrationConfirmedAt: confirmedAt } : {}), providerPaidStateVerifiedAt: confirmedAt, updatedAt: confirmedAt });
    transaction.set(db.collection("tournamentEntryReservations").doc(paymentId), { status: allPaid ? "confirmed" : "member_confirmed", updatedAt: confirmedAt }, { merge: true });
    transaction.create(db.collection("tournamentFinancialLedger").doc(`entry_${paymentId}`), { id: `entry_${paymentId}`, tournamentId: payment.tournamentId, paymentId, teamId: payment.teamId, teamAttemptId: attempt.id, payerUserId: payment.userId, amountCents: payment.amountCents, currency: payment.currency, status: allPaid ? "confirmed_entry_fee" : "pending_team_registration", provider: "stripe", providerSessionId: session.id, providerPaymentIntentId: evidence.paymentIntent.id, providerChargeId: evidence.charge.id, idempotencyKey: paymentId, createdAt: confirmedAt });
    if (allPaid) {
      for (const document of payments) {
        if (document.id !== paymentId) {
          transaction.set(document.ref, { status: "confirmed", teamRegistrationConfirmedAt: confirmedAt, updatedAt: confirmedAt }, { merge: true });
          transaction.set(db.collection("tournamentFinancialLedger").doc(`entry_${document.id}`), { status: "confirmed_entry_fee", teamRegistrationConfirmedAt: confirmedAt }, { merge: true });
          transaction.set(db.collection("tournamentEntryReservations").doc(document.id), { status: "confirmed", updatedAt: confirmedAt }, { merge: true });
        }
      }
      const count = confirmedCount + 1;
      const full = count === Number(tournament.participantCapacity);
      const version = Number(tournament.activationVersion ?? 0) + (full ? 1 : 0);
      transaction.update(teamRef, { status: "ready", paymentStatus: "confirmed", slotReservedAt: confirmedAt, rosterLockedAt: confirmedAt, entryPaymentIds: payments.map(document => document.id), activeRegistrationAttemptId: null, paymentReservationId: null, paymentReservationExpiresAt: null, updatedAt: confirmedAt });
      transaction.update(attemptRef, { status: "confirmed", confirmedAt, updatedAt: confirmedAt });
      transaction.update(tournamentRef, { participantCount: count, timingLockedAt: tournament.timingLockedAt ?? confirmedAt, firstConfirmedEntrantAt: tournament.firstConfirmedEntrantAt ?? confirmedAt,
        ...(full ? { activationVersion: version, activationState: "provisional", activationWindowEndsAt: new Date(now.getTime() + 5000).toISOString(), registrationFullAt: confirmedAt } : {}), updatedAt: confirmedAt });
      if (full) {
        activationJobId = `${payment.tournamentId}_activation_v${version}`;
        transaction.create(db.collection("tournamentJobs").doc(activationJobId), { id: activationJobId, tournamentId: payment.tournamentId, type: "activate_full_tournament", status: "pending", version, runAt: new Date(now.getTime() + 5000).toISOString(), schedulerDispatchState: "pending", schedulerDispatchAttempts: 0, createdAt: confirmedAt, updatedAt: confirmedAt });
      }
    }
    transaction.create(db.collection("tournamentAuditEvents").doc(`${paymentId}_confirmed`), { id: `${paymentId}_confirmed`, tournamentId: payment.tournamentId, actorId: "stripe", action: allPaid ? "team_registration_confirmed" : "team_member_payment_confirmed", createdAt: confirmedAt, metadata: { paymentId, attemptId: attempt.id, teamId: payment.teamId, payerUserId: payment.userId } });
    return { handled: true, kind: "tournament_entry", status: allPaid ? "confirmed" : "member_confirmed", teamRegistered: allPaid, duplicate: false };
  });
  if (activationJobId) await dispatchTournamentActivationOutbox(db, activationJobId);
  if (typeof session.metadata?.tournamentId === "string") await deliverTournamentNotifications(db, session.metadata.tournamentId).catch(() => console.warn("[tournament-notification] Team event delivery deferred."));
  return result;
}

export async function processTournamentTeamExpiryJob(db: Firestore, jobId: string, version: number, now = new Date()) {
  const ref = db.collection("tournamentJobs").doc(jobId);
  const job = await ref.get();
  const data = job.data();
  if (!data || data.type !== "expire_team_registration" || Number(data.version) !== version) return { status: "skipped", code: "TASK_VERSION_STALE" };
  if (data.status !== "pending") return { status: "skipped", code: "JOB_ALREADY_PROCESSED" };
  if (Date.parse(String(data.runAt)) > now.getTime()) return { status: "not_due", code: "TASK_NOT_DUE" };
  const attempt = await db.collection("tournamentTeamRegistrationAttempts").doc(String(data.teamAttemptId)).get();
  if (!attempt.exists || attempt.data()?.tournamentId !== data.tournamentId) throw error("Expiry job has an invalid team attempt reference.", "TEAM_ATTEMPT_REFERENCE_MISMATCH");
  const outcome = await expireTournamentTeamAttempt(db, attempt.id, now);
  if (outcome.status !== "not_due") await db.runTransaction(async transaction => {
    const current = await transaction.get(ref);
    if (current.data()?.status === "pending" && Number(current.data()?.version) === version) transaction.update(ref, { status: "completed", completedAt: now.toISOString(), updatedAt: now.toISOString() });
  });
  return outcome;
}
