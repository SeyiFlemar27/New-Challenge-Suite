import type { Firestore } from "firebase-admin/firestore";
import { isIndividualTournamentPolicy } from "@/lib/individual-tournament-policy";
import { deterministicId } from "@/lib/server/idempotency";

/** Participant-owned, reason-free withdrawal before the bracket fills. Refund
 * liabilities are durable; no provider success or external call is fabricated. */
export async function withdrawIndividualEntry(db: Firestore, tournamentId: string, userId: string, now = new Date()) {
  return db.runTransaction(async tx => {
    const tournamentRef = db.collection("tournaments").doc(tournamentId), participantRef = db.collection("tournamentParticipants").doc(`${tournamentId}_${userId}`);
    const [tournament, participant] = await tx.getAll(tournamentRef, participantRef);
    const data = tournament.data() ?? {}, entry = participant.data() ?? {};
    if (!tournament.exists || !isIndividualTournamentPolicy(data) || data.participationMode !== "individual" || !participant.exists || entry.userId !== userId || entry.tournamentId !== tournamentId) throw new Error("INDIVIDUAL_WITHDRAWAL_ENTRY_REQUIRED");
    if (entry.status === "withdrawn") return { status: "withdrawn", idempotent: true, refundStatus: entry.paymentStatus === "refunded" ? "provider_confirmed" : entry.paymentStatus === "refund_required" ? "provider_confirmation_pending" : "not_required" };
    if (data.status !== "registration_open" || data.activationState === "provisional" || data.activationState === "activated" || data.activationActivatedAt || Number(data.participantCount) >= Number(data.participantCapacity)) throw new Error("WITHDRAWAL_LOCKED_AFTER_FILL");
    if (entry.status !== "registered") throw new Error("WITHDRAWAL_REGISTRATION_REQUIRED");
    const participants = await tx.get(db.collection("tournamentParticipants").where("tournamentId", "==", tournamentId).limit(65));
    const active = participants.docs.filter(row => ["registered", "active", "checked_in"].includes(String(row.data().status)));
    if (participants.size > 64 || active.length !== Number(data.participantCount) || active.length >= Number(data.participantCapacity)) throw new Error("WITHDRAWAL_CAPACITY_RECONCILIATION_REQUIRED");
    const payments = await tx.get(db.collection("tournamentEntryPayments").where("tournamentId", "==", tournamentId).limit(129));
    if (payments.size > 128) throw new Error("WITHDRAWAL_PAYMENT_RECONCILIATION_REQUIRED");
    const confirmed = payments.docs.filter(row => row.data().userId === userId && row.data().entrantId === participant.id && row.data().webhookConfirmed === true && ["confirmed", "paid"].includes(String(row.data().status)));
    if (data.entryType !== "free" && confirmed.length !== 1 || confirmed.some(row => !Number.isSafeInteger(row.data().amountCents) || row.data().amountCents <= 0 || !row.data().providerPaymentIntentId || row.data().stripeDisputeRestricted === true)) throw new Error("WITHDRAWAL_PAYMENT_RECONCILIATION_REQUIRED");
    const refunds = confirmed.length ? await tx.getAll(...confirmed.map(row => db.collection("refundCases").doc(deterministicId("refund_tournamentEntryPayments", row.id)))) : [];
    for (const [index, payment] of confirmed.entries()) {
      const refundId = deterministicId("refund_tournamentEntryPayments", payment.id), p = payment.data();
      if (!refunds[index].exists) tx.create(db.collection("refundCases").doc(refundId), { id: refundId, paymentCollection: "tournamentEntryPayments", paymentId: payment.id, tournamentId, userId, provider: "stripe", providerPaymentIntentId: p.providerPaymentIntentId, amountCents: p.amountCents, currency: p.currency, status: "required", refundType: "mandatory_tournament_entry_reversal", reason: "PARTICIPANT_WITHDREW", idempotencyKey: refundId, createdAt: now.toISOString(), updatedAt: now.toISOString() });
      tx.update(payment.ref, { status: "refund_required", refundStatus: "required", refundType: "mandatory_tournament_entry_reversal", refundReason: "PARTICIPANT_WITHDREW", updatedAt: now.toISOString() });
    }
    tx.update(participantRef, { status: "withdrawn", withdrawalBeforeActivation: true, paymentStatus: confirmed.length ? "refund_required" : entry.paymentStatus ?? "not_required", withdrawnAt: now.toISOString(), updatedAt: now.toISOString() });
    tx.update(tournamentRef, { participantCount: active.length - 1, updatedAt: now.toISOString() });
    tx.create(db.collection("tournamentAuditEvents").doc(`${participant.id}_withdrawal_${Number(entry.registrationRevision ?? 0)}`), { tournamentId, actorId: userId, action: "individual_entry_withdrawn", createdAt: now.toISOString(), metadata: { participantId: participant.id, fullEntryRefundRequired: confirmed.length > 0, providerCalled: false } });
    return { status: "withdrawn", idempotent: false, refundStatus: confirmed.length ? "provider_confirmation_pending" : "not_required" };
  });
}
