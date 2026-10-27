import type { Firestore } from "firebase-admin/firestore";
import { deterministicId } from "@/lib/server/idempotency";
import { isIndividualTournamentPolicy } from "@/lib/individual-tournament-policy";
import { getStripe } from "@/lib/stripe";
import { initiateTournamentEntryRefund } from "@/lib/server/tournament-paid-entry";
import type Stripe from "stripe";

export async function cancelIndividualTournament(db: Firestore, input: { tournamentId: string; actorId: string; isAdmin: boolean; confirmed: boolean; reason: string }, now = new Date()) {
  if (!input.confirmed || input.reason.trim().length < 5) throw new Error("CANCELLATION_CONFIRMATION_REQUIRED");
  return db.runTransaction(async transaction => {
    const ref = db.collection("tournaments").doc(input.tournamentId), snapshot = await transaction.get(ref), data = snapshot.data() ?? {};
    if (!snapshot.exists || !isIndividualTournamentPolicy(data)) throw new Error("INDIVIDUAL_CANCELLATION_POLICY_REQUIRED");
    const activated = data.activationState === "activated" || Boolean(data.activationActivatedAt) || ["active", "round_active", "round_review", "final", "under_review", "winners_announced", "completed"].includes(String(data.status)) || ["active", "round_active"].includes(String(data.pausedFromStatus));
    if (!input.isAdmin && (data.hostId !== input.actorId || activated)) throw new Error("CANCELLATION_ADMIN_REQUIRED");
    if (data.status === "cancelled") return { status: "cancelled", idempotent: true, refundsQueued: 0, providerCalled: false };
    const payments = await transaction.get(db.collection("tournamentEntryPayments").where("tournamentId", "==", input.tournamentId).limit(129));
    if (payments.size > 128) throw new Error("CANCELLATION_PAYMENT_RECONCILIATION_REQUIRED");
    const eligible = payments.docs.filter(row => row.data().webhookConfirmed === true && ["paid", "confirmed", "refund_required", "refund_pending"].includes(String(row.data().status)));
    const cases = eligible.length ? await transaction.getAll(...eligible.map(row => db.collection("refundCases").doc(deterministicId("refund_tournamentEntryPayments", row.id)))) : [];
    if (eligible.some(row => !Number.isSafeInteger(row.data().amountCents) || row.data().amountCents <= 0 || !row.data().providerPaymentIntentId || row.data().stripeDisputeRestricted === true)) throw new Error("CANCELLATION_PAYMENT_RECONCILIATION_REQUIRED");
    let refundsQueued = 0;
    for (const [index, payment] of eligible.entries()) {
      if (cases[index].exists) continue; // Preserve any processing/succeeded/refused case for reconciliation.
      const record = payment.data(), refundId = cases[index].id;
      transaction.create(cases[index].ref, { id: refundId, tournamentId: input.tournamentId, paymentCollection: "tournamentEntryPayments", paymentId: payment.id, userId: record.userId, provider: "stripe", providerPaymentIntentId: record.providerPaymentIntentId, amountCents: record.amountCents, currency: record.currency, status: "required", refundType: "mandatory_tournament_entry_reversal", reason: "TOURNAMENT_CANCELLED", cancellationReason: input.reason, idempotencyKey: refundId, createdAt: now.toISOString(), updatedAt: now.toISOString() });
      transaction.update(payment.ref, { refundPreviousPaymentStatus: record.status, status: "refund_required", refundStatus: "required", refundType: "mandatory_tournament_entry_reversal", refundReason: "TOURNAMENT_CANCELLED", updatedAt: now.toISOString() });
      refundsQueued++;
    }
    transaction.update(ref, { status: "cancelled", cancelledAt: now.toISOString(), cancelledBy: input.actorId, cancellationReason: input.reason, financialHold: true, settlementRestricted: true, cancellationRefundStatus: eligible.length ? "provider_confirmation_pending" : "no_confirmed_entry_payments", updatedAt: now.toISOString() });
    transaction.create(db.collection("tournamentAuditEvents").doc(`${input.tournamentId}_cancelled`), { tournamentId: input.tournamentId, actorId: input.actorId, action: "cancel", reason: input.reason, createdAt: now.toISOString(), metadata: { previousStatus: data.status, activated, refundsQueued, refundsCompleted: false, providerCalled: false } });
    return { status: "cancelled", idempotent: false, refundsQueued, providerCalled: false };
  });
}

/** Uses the existing gated provider boundary and stable full-refund idempotency key. */
export async function processIndividualCancellationRefunds(db: Firestore, tournamentId: string, adapter?: Stripe) {
  const ref = db.collection("tournaments").doc(tournamentId), tournament = await ref.get();
  if (!tournament.exists || !isIndividualTournamentPolicy(tournament.data()!)) return { processed: 0, status: "not_applicable" };
  const refunds = await db.collection("refundCases").where("tournamentId", "==", tournamentId).limit(129).get();
  if (refunds.size > 128) throw new Error("CANCELLATION_PAYMENT_RECONCILIATION_REQUIRED");
  const reasons = tournament.data()?.status === "cancelled" ? ["TOURNAMENT_CANCELLED", "PARTICIPANT_WITHDREW"] : ["PARTICIPANT_WITHDREW"];
  if (!refunds.docs.some(row => reasons.includes(String(row.data().reason)))) return { processed: 0, status: "not_required" };
  const provider = adapter ?? (process.env.TOURNAMENT_ENTRY_PAYMENTS_ENABLED === "true" ? getStripe() : null);
  if (!provider) return { processed: 0, status: "provider_unavailable" };
  let processed = 0;
  for (const row of refunds.docs.filter(row => reasons.includes(String(row.data().reason)) && ["required", "approved", "processing"].includes(String(row.data().status))).slice(0, 25)) {
    await initiateTournamentEntryRefund(provider, db, String(row.data().paymentId));
    processed++;
  }
  const current = await db.collection("refundCases").where("tournamentId", "==", tournamentId).limit(129).get();
  const complete = current.size <= 128 && current.docs.filter(row => reasons.includes(String(row.data().reason))).every(row => row.data().status === "succeeded");
  await ref.set({ [tournament.data()?.status === "cancelled" ? "cancellationRefundStatus" : "withdrawalRefundStatus"]: complete ? "provider_confirmed" : "provider_confirmation_pending" }, { merge: true });
  return { processed, status: complete ? "provider_confirmed" : "provider_confirmation_pending" };
}
