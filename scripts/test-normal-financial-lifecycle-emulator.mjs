import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { initializeApp, deleteApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import { queueNormalRefund, executeNormalPolicyRefund, reconcileNormalRefund } from "../lib/server/normal-refunds.ts";
import { createWithdrawalRequest } from "../lib/server/withdrawals.ts";
import { clearNormalChallengeEarnings } from "../lib/server/normal-earnings-clearance.ts";
import { disqualifyNormalParticipant } from "../lib/server/normal-disqualification.ts";
import { runFinancialTransaction } from "../lib/server/financial-transaction.ts";
assert.match(process.env.GCLOUD_PROJECT ?? "", /^demo-/);
assert.match(process.env.FIRESTORE_EMULATOR_HOST ?? "", /^(localhost|127\.0\.0\.1):\d+$/);
const app = initializeApp({ projectId: process.env.GCLOUD_PROJECT });
const db = getFirestore(app);
const prefix = `normal_finance_${randomUUID()}`;
const userId = `${prefix}_user`;
const challengeId = `${prefix}_challenge`;
const refs = [];
const ref = (collection, id) => { const value = db.collection(collection).doc(id); refs.push(value); return value; };
let assertions = 0;
const equal = (actual, expected, name) => { assert.equal(actual, expected, name); assertions++; };
const now = new Date("2026-10-14T12:00:00Z");
async function payment(label, extra = {}) {
  const id = `${prefix}_${label}`;
  await ref("challengeEntryPayments", id).set({ userId, challengeId, status: "paid", webhookConfirmed: true, providerPaymentIntentId: `pi_${id}`, amountCents: 500, currency: "usd", winnerShareCents: 325, creatorHostOperatorShareCents: 100, platformFeeCents: 75, ...extra });
  return id;
}
try {
  await ref("challenges", challengeId).set({ builderVersion: "normal_v3", normalLifecyclePolicyVersion: 1, status: "submission_open", submissionDeadline: "2026-10-14T10:00:00Z", pendingEntryFeeRevenueGrossCents: 500, pendingEntryFeeWinnerShareCents: 325, pendingEntryFeeCreatorShareCents: 100, pendingEntryFeePlatformFeeCents: 75 });
  await ref("challengeParticipants", `${challengeId}_${userId}`).set({ userId, challengeId, status: "active" });
  const id = await payment("missing");
  const cases = await Promise.all([queueNormalRefund(db, { challengeId, paymentCollection: "challengeEntryPayments", paymentId: id, cause: "not_submitted", now }), queueNormalRefund(db, { challengeId, paymentCollection: "challengeEntryPayments", paymentId: id, cause: "not_submitted", now })]);
  equal(cases.filter(value => value.duplicate).length, 1, "concurrent refund eligibility creates one original-payment case");
  const caseId = `refund_challengeEntryPayments_${id}`;
  refs.push(db.collection("refundCases").doc(caseId));
  let calls = 0;
  const provider = { paymentIntents: { retrieve: async intent => ({ id: intent, status: "succeeded", amount_received: 500, currency: "usd", latest_charge: { captured: true, paid: true, disputed: false, amount_refunded: 0 } }) }, refunds: { create: async input => { calls++; return { id: `re_${id}`, payment_intent: input.payment_intent, amount: 500, currency: "usd", status: "succeeded" }; } } };
  await Promise.all([executeNormalPolicyRefund(db, caseId, provider, now), executeNormalPolicyRefund(db, caseId, provider, now)]);
  equal(calls, 1, "concurrent refund execution calls provider once");
  equal((await db.collection("challengeEntryPayments").doc(id).get()).data().status, "refunded", "verified provider outcome reconciles original entry payment");
  equal((await db.collection("challenges").doc(challengeId).get()).data().pendingEntryFeeRevenueGrossCents, 0, "refunded gross is not distributable revenue");
  equal((await db.collection("challengeParticipants").doc(`${challengeId}_${userId}`).get()).data().entryPaymentStatus, "refunded", "refunded entry loses paid eligibility");
  await reconcileNormalRefund(db, { refundCaseId: caseId, providerRefundId: `re_${id}`, paymentIntentId: `pi_${id}`, amountCents: 500, currency: "USD", providerStatus: "succeeded", now });
  equal((await db.collection("challenges").doc(challengeId).get()).data().pendingEntryFeeRevenueGrossCents, 0, "duplicate provider confirmation cannot reverse revenue twice");
  await db.collection("challengeParticipants").doc(`${challengeId}_${userId}`).update({ status: "disqualified" });
  const disputed = await payment("disputed", { stripeDisputeRestricted: true });
  const held = await queueNormalRefund(db, { challengeId, paymentCollection: "challengeEntryPayments", paymentId: disputed, cause: "disqualification", now });
  refs.push(db.collection("refundCases").doc(held.id));
  equal(held.status, "financial_hold", "disputed original payment cannot be automatically refunded");
  await executeNormalPolicyRefund(db, held.id, provider, now);
  equal(calls, 1, "financial hold prevents provider execution");
  const lateWithdrawal = await payment("post_voting_withdrawal");
  await db.collection("challenges").doc(challengeId).update({ effectiveVotingStartsAt: now.toISOString() });
  await db.collection("challengeParticipants").doc(`${challengeId}_${userId}`).update({ status: "withdrawn", withdrawnAt: now.toISOString() });
  const withdrawalHold = await queueNormalRefund(db, { challengeId, paymentCollection: "challengeEntryPayments", paymentId: lateWithdrawal, cause: "voluntary_withdrawal", now });
  refs.push(db.collection("refundCases").doc(withdrawalHold.id));
  equal(withdrawalHold.status, "financial_hold", "withdrawal exactly at effective voting start cannot automatically refund");
  await executeNormalPolicyRefund(db, withdrawalHold.id, provider, now);
  equal(calls, 1, "exceptional withdrawal needs Admin reconciliation before provider execution");
  const walletId = `${prefix}_wallet`;
  const first = `${prefix}_earning_a`, second = `${prefix}_earning_b`;
  await ref("cashWallets", walletId).set({ userId: walletId, availableBalanceCents: 10000, pendingBalanceCents: 0, underReviewBalanceCents: 0 });
  for (const earningId of [first, second]) await ref("cashLedger", earningId).set({ userId: walletId, direction: "credit", status: "available", sourceType: "challenge_winner_prize", currency: "USD", amountCents: 5000, netAmountCents: 5000 });
  const requestInput = { userId: walletId, amountCents: 6000, currency: "USD", sourceType: "aggregated_earnings", sourceIds: [first, second], payoutMethodType: "bank_transfer", payoutMethodLabel: "Fixture bank ****1234", payoutMethodLast4: "1234", accountHolderName: "Fixture holder", bankName: "Fixture bank", country: "US", kycStatusAtRequest: "not_required_development", idempotencyKey: "first_request", now: now.toISOString() };
  const withdrawals = await Promise.all([runFinancialTransaction(db, transaction => createWithdrawalRequest(db, transaction, requestInput)), runFinancialTransaction(db, transaction => createWithdrawalRequest(db, transaction, requestInput))]);
  equal(withdrawals.filter(value => value.created).length, 1, "concurrent withdrawal reserves aggregate funds once");
  equal((await db.collection("cashWallets").doc(walletId).get()).data().availableBalanceCents, 4000, "partial withdrawal leaves unreserved balance");
  equal((await db.collection("cashLedger").doc(second).get()).data().availableAmountCents, 4000, "partial source remains available");
  equal(withdrawals[0].request.payoutExecuted, false, "reservation does not fabricate disbursement");
  equal(withdrawals[0].request.feeAmountCents, null, "unknown provider fee is not invented");
  equal(Date.parse(withdrawals[0].request.earliestProcessingAt) - now.getTime(), 24 * 60 * 60_000, "first withdrawal gets additional 24-hour security hold");
  const clearanceId = `${prefix}_clearance`;
  await ref("challenges", clearanceId).set({ normalLifecyclePolicyVersion: 1, winnersApprovedAt: "2026-10-11T12:00:00Z" });
  await ref("challengeSettlements", clearanceId).set({ challengeId: clearanceId, status: "created_pending_review" });
  await ref("cashWallets", clearanceId).set({ pendingBalanceCents: 5000, availableBalanceCents: 0 });
  await ref("cashLedger", clearanceId).set({ challengeId: clearanceId, userId: clearanceId, settlementId: clearanceId, direction: "credit", status: "pending_review", netAmountCents: 5000, balanceBucket: "pending", createdAt: "2026-10-11T12:00:00Z", holdUntil: now.toISOString() });
  equal((await clearNormalChallengeEarnings(db, clearanceId, new Date(now.getTime() - 1))).cleared, 0, "72-hour boundary minus one millisecond remains held");
  const clearance = await Promise.all([clearNormalChallengeEarnings(db, clearanceId, now), clearNormalChallengeEarnings(db, clearanceId, now)]);
  equal(clearance.reduce((sum, value) => sum + value.cleared, 0), 1, "concurrent clearance moves earnings once at 72 hours");
  equal((await db.collection("cashWallets").doc(clearanceId).get()).data().availableBalanceCents, 5000, "clearance credits available balance without payout");
  const finalizedId = `${prefix}_finalized`;
  const finalistId = `${finalizedId}_${userId}`;
  await ref("challenges", finalizedId).set({ builderVersion: "normal_v3", normalLifecyclePolicyVersion: 1, settlementId: finalizedId, winnersApprovedAt: now.toISOString() });
  await ref("challengeParticipants", finalistId).set({ userId, challengeId: finalizedId, status: "winner" });
  await ref("cashLedger", `${finalizedId}_pending`).set({ userId, challengeId: finalizedId, direction: "credit", status: "pending_hold", netAmountCents: 5000 });
  await ref("cashLedger", `${finalizedId}_paid`).set({ userId, challengeId: finalizedId, direction: "credit", status: "paid_out", externalPayoutExecuted: true, netAmountCents: 5000 });
  await ref("cashLedger", `${finalizedId}_other`).set({ userId: "other_winner", challengeId: finalizedId, direction: "credit", status: "pending_hold", netAmountCents: 2000 });
  const disqualification = { participantId: finalistId, adminId: "fixture_admin", reason: "Verified formal disqualification requires reconciliation", confirmed: true, now };
  const decisions = await Promise.all([disqualifyNormalParticipant(db, disqualification), disqualifyNormalParticipant(db, disqualification)]);
  equal(decisions.filter(value => value.duplicate).length, 1, "concurrent final disqualification records one decision");
  equal((await db.collection("cashLedger").doc(`${finalizedId}_pending`).get()).data().disputeRestricted, true, "affected unpaid entitlement is frozen");
  equal((await db.collection("cashLedger").doc(`${finalizedId}_paid`).get()).data().status, "paid_out", "completed payout is preserved");
  equal((await db.collection("cashLedger").doc(`${finalizedId}_other`).get()).data().disputeRestricted, undefined, "unaffected winner entitlement is preserved");
  equal((await db.collection("refundCases").where("challengeId", "==", finalizedId).get()).size, 0, "final disqualification does not create an automatic refund");
  refs.push(db.collection("normalLifecycleJobs").doc(`normal_${finalizedId}`), db.collection("adminActionTasks").doc(`normal_finalized_disqualification_${finalistId}`));
  console.log(`Normal financial lifecycle emulator: ${assertions} assertions passed.`);
} finally {
  for (const collection of ["auditLogs", "challengeFinancialLedger"]) {
    for (const id of [challengeId, `${prefix}_clearance`, `${prefix}_finalized`]) {
      const docs = await db.collection(collection).where("challengeId", "==", id).get();
      await Promise.all(docs.docs.map(doc => doc.ref.delete()));
    }
  }
  const requests = await db.collection("withdrawalRequests").where("userId", "==", `${prefix}_wallet`).get();
  for (const request of requests.docs) { await request.ref.delete(); const ledger = await db.collection("cashLedger").where("sourceId", "==", request.id).get(); await Promise.all(ledger.docs.map(doc => doc.ref.delete())); }
  const methods = await db.collection("payoutMethods").where("userId", "==", `${prefix}_wallet`).get(); await Promise.all(methods.docs.map(doc => doc.ref.delete()));
  await Promise.all(refs.map(value => value.delete()));
  await deleteApp(app);
}
