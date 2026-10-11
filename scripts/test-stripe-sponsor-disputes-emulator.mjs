import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import Stripe from "stripe";
import { initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore } from "firebase-admin/firestore";
import { setStripeClientForTests } from "../lib/stripe.ts";

assert.ok(process.env.FIRESTORE_EMULATOR_HOST, "FIRESTORE_EMULATOR_HOST is required");
assert.ok(process.env.FIREBASE_AUTH_EMULATOR_HOST, "FIREBASE_AUTH_EMULATOR_HOST is required");
process.env.FIREBASE_PROJECT_ID ??= process.env.GCLOUD_PROJECT ?? "demo-challenge-suite";
process.env.FIREBASE_STORAGE_BUCKET ??= `${process.env.FIREBASE_PROJECT_ID}.firebasestorage.app`;
process.env.CHALLENGE_SUITE_USE_FIREBASE_EMULATORS = "true";
process.env.STRIPE_SECRET_KEY ??= "sk_test_dispute_emulator";
process.env.STRIPE_WEBHOOK_SECRET ??= "whsec_dispute_emulator";
const runId = `sponsor_dispute_${randomUUID().replaceAll("-", "")}`;
const app = initializeApp({ projectId: process.env.FIREBASE_PROJECT_ID ?? "demo-challenge-suite", storageBucket: process.env.FIREBASE_STORAGE_BUCKET });
const db = getFirestore(app);
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
const challengeId = `${runId}_challenge`;
const contributionId = `${runId}_contribution`;
const paymentIntentId = `pi_${runId}`;
const chargeId = `ch_${runId}`;
const disputeId = `dp_${runId}`;
const mismatchedDisputeId = `dp_${runId}_mismatched`;
const settlementId = `${runId}_settlement`;
const unpaidLedgerId = `${runId}_unpaid`;
const paidLedgerId = `${runId}_paid`;
const refundCaseId = `${runId}_refund_case`;
let currentStatus = "needs_response";
let eventToReturn;
const providerEventIds = new Set();
const paginationFixtureIds = [];
stripe.webhooks.constructEvent = () => eventToReturn;
stripe.disputes.retrieve = async (id) => ({ id, object: "dispute", charge: chargeId, payment_intent: paymentIntentId, amount: 2500, currency: "usd", status: currentStatus, created: Math.floor(Date.now() / 1000) });
stripe.charges.retrieve = async (id) => ({ id, object: "charge", amount: 10000, currency: "usd", payment_intent: paymentIntentId });
stripe.paymentIntents.retrieve = async (id) => ({ id, object: "payment_intent", amount: 10000, amount_received: 10000, currency: "usd", latest_charge: chargeId });
setStripeClientForTests(stripe);

const adminAuth = getAuth(app);
const email = `${runId}@example.test`;
const admin = await adminAuth.createUser({ email, password: "TestPassword123!", emailVerified: true });
await adminAuth.setCustomUserClaims(admin.uid, { admin: true });
await db.collection("users").doc(admin.uid).set({ adminRoles: ["admin"], adminAccessStatus: "active", adminSecuritySetupComplete: true, emailVerified: true });
const token = await adminAuth.createCustomToken(admin.uid, { admin: true });
const signInResponse = await fetch(`http://${process.env.FIREBASE_AUTH_EMULATOR_HOST}/identitytoolkit.googleapis.com/v1/accounts:signInWithCustomToken?key=fake-api-key`, {
  method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ token, returnSecureToken: true })
});
assert.equal(signInResponse.ok, true, "Admin test token must be exchanged by Auth Emulator");
const idToken = (await signInResponse.json()).idToken;
const webhookRequest = () => {
  providerEventIds.add(eventToReturn.id);
  return new Request("http://localhost/api/stripe/webhook", { method: "POST", headers: { "stripe-signature": "verified-by-test-boundary" }, body: JSON.stringify(eventToReturn) });
};
let assertions = 0;
function check(condition, message) { assertions += 1; assert.ok(condition, message); }

try {
  await Promise.all([
    db.collection("challenges").doc(challengeId).set({ id: challengeId, status: "winners_announced" }),
    db.collection("sponsorContributions").doc(contributionId).set({ id: contributionId, challengeId, sponsorId: `${runId}_sponsor`, sponsorOrganizationId: `${runId}_org`, agreementId: `${runId}_agreement`, status: "confirmed", webhookConfirmed: true, paymentPurpose: "sponsor_funding", amountCents: 10000, currency: "USD", stripePaymentIntentId: paymentIntentId, stripeChargeId: chargeId }),
    db.collection("challengeSettlements").doc(settlementId).set({ id: settlementId, challengeId, status: "created_pending_review", walletCreditIds: [unpaidLedgerId, paidLedgerId] }),
    db.collection("cashLedger").doc(unpaidLedgerId).set({ id: unpaidLedgerId, settlementId, userId: `${runId}_winner1`, sourceType: "sponsor_prize", netAmountCents: 6000, status: "available", direction: "credit" }),
    db.collection("cashLedger").doc(paidLedgerId).set({ id: paidLedgerId, settlementId, userId: `${runId}_winner2`, sourceType: "sponsor_prize", netAmountCents: 4000, status: "paid_out", direction: "credit", paid: true })
  ]);
  const { POST: webhook } = await import("../app/api/stripe/webhook/route.ts");
  const { GET: listChargebacks } = await import("../app/api/admin/chargebacks/route.ts");
  const { PATCH: reconcile } = await import("../app/api/admin/chargebacks/route.ts");
  const { recordStripeSponsorDispute } = await import("../lib/server/stripe-sponsor-disputes.ts");
  const mismatched = await recordStripeSponsorDispute(db, {
    dispute: { id: mismatchedDisputeId, charge: `${chargeId}_wrong`, payment_intent: paymentIntentId, amount: 2500, currency: "usd", status: "needs_response", created: Math.floor(Date.now() / 1000) },
    charge: { id: `${chargeId}_wrong`, payment_intent: paymentIntentId, amount: 10000, currency: "usd" },
    paymentIntent: { id: paymentIntentId, latest_charge: `${chargeId}_wrong`, amount: 10000, currency: "usd" },
    eventId: `evt_${runId}_mismatched`, eventType: "charge.dispute.created"
  });
  check(mismatched.linked === false && (await db.collection("sponsorContributions").doc(contributionId).get()).data()?.stripeDisputeRestricted !== true, "mismatched provider charge references are durably unlinked and cannot restrict or attach to another contribution");
  eventToReturn = { id: `evt_${runId}_created`, type: "charge.dispute.created", created: Math.floor(Date.now() / 1000), data: { object: { id: disputeId, object: "dispute", charge: chargeId, payment_intent: paymentIntentId, amount: 2500, currency: "usd", status: "needs_response" } } };
  const created = await webhook(webhookRequest());
  check(created.status === 200, "signed dispute-created event is acknowledged");
  const concurrentCreated = await Promise.all([webhook(webhookRequest()), webhook(webhookRequest())]);
  const concurrentBodies = await Promise.all(concurrentCreated.map((response) => response.json()));
  check(concurrentCreated.every((response) => response.status === 200) && concurrentBodies.filter((body) => body.data?.duplicate === true).length === 2, "concurrent duplicate dispute delivery is acknowledged idempotently without repeating restriction effects");
  const duplicateCreated = await webhook(webhookRequest());
  check((await duplicateCreated.json()).data?.duplicate === true, "duplicate delivery of the exact same Stripe event is acknowledged without reprocessing");
  let contribution = (await db.collection("sponsorContributions").doc(contributionId).get()).data();
  check(contribution.stripeDisputeRestricted === true, "verified credited contribution becomes restricted");
  const { getConfirmedSponsorContributionForChallenge } = await import("../lib/server/monetization-payments.ts");
  check((await getConfirmedSponsorContributionForChallenge(db, challengeId)).grossAmountCents === 0, "disputed sponsor funds are excluded from confirmed distributable prize totals");
  let settlement = (await db.collection("challengeSettlements").doc(settlementId).get()).data();
  check(settlement.disputeRestricted === true && settlement.status === "disputed_pending_admin_reconciliation", "settlement is frozen and prior state recorded");
  const unpaid = (await db.collection("cashLedger").doc(unpaidLedgerId).get()).data();
  const paid = (await db.collection("cashLedger").doc(paidLedgerId).get()).data();
  check(unpaid.disputeRestricted === true, "unpaid ledger allocation is blocked");
  check(paid.status === "paid_out" && paid.paid === true, "completed payout remains unchanged");
  check(settlement.disputedCompletedPayoutExposureCents === 4000, "completed payout exposure is recorded from persisted paid ledger entries");
  const caseId = (await db.collection("chargebackCases").where("stripeDisputeId", "==", disputeId).limit(1).get()).docs[0].id;
  await Promise.all(Array.from({ length: 51 }, (_, index) => {
    const fixtureId = `${runId}_pagination_${String(index).padStart(2, "0")}`;
    paginationFixtureIds.push(fixtureId);
    return db.collection("chargebackCases").doc(fixtureId).set({ id: fixtureId, caseType: "pagination_fixture", createdAt: new Date(Date.UTC(2099, 0, 1, 0, 0, index)).toISOString() });
  }));
  const firstChargebackPage = await listChargebacks(new Request("http://localhost/api/admin/chargebacks?limit=50", { headers: { authorization: `Bearer ${idToken}` } }));
  const firstChargebackPayload = await firstChargebackPage.json();
  check(firstChargebackPage.status === 200 && firstChargebackPayload.data?.chargebacks.length === 50 && firstChargebackPayload.data.hasMore === true && typeof firstChargebackPayload.data.nextCursor === "string", "Admin chargeback queue returns a bounded first page and a cursor when historical cases remain");
  const secondChargebackPage = await listChargebacks(new Request(`http://localhost/api/admin/chargebacks?limit=50&cursor=${encodeURIComponent(firstChargebackPayload.data.nextCursor)}`, { headers: { authorization: `Bearer ${idToken}` } }));
  const secondChargebackPayload = await secondChargebackPage.json();
  const pageIds = [...firstChargebackPayload.data.chargebacks, ...secondChargebackPayload.data.chargebacks].map((item) => item.id);
  check(secondChargebackPage.status === 200 && pageIds.includes(caseId) && new Set(pageIds).size === pageIds.length && secondChargebackPayload.data.hasMore === false, "Admin cursor pages reach older dispute cases without duplicate records");
  const invalidChargebackCursor = await listChargebacks(new Request("http://localhost/api/admin/chargebacks?cursor=missing-case", { headers: { authorization: `Bearer ${idToken}` } }));
  check(invalidChargebackCursor.status === 400, "Missing chargeback cursor is rejected with a client validation response");

  const { createWithdrawalRequest } = await import("../lib/server/withdrawals.ts");
  await assert.rejects(() => db.runTransaction((transaction) => createWithdrawalRequest(db, transaction, {
    userId: `${runId}_winner1`, amountCents: 6000, currency: "USD", sourceType: "sponsor_prize", sourceIds: [unpaidLedgerId],
    payoutMethodType: "bank_transfer", payoutMethodLabel: "Test bank", payoutMethodLast4: "1111", accountHolderName: "Test Winner",
    bankName: "Test Bank", country: "US", kycStatusAtRequest: "not_started", idempotencyKey: runId, now: new Date().toISOString()
  })), /WITHDRAWAL_SOURCE_NOT_ELIGIBLE/);
  assertions += 1;

  currentStatus = "under_review";
  eventToReturn = { id: `evt_${runId}_updated`, type: "charge.dispute.updated", created: Math.floor(Date.now() / 1000), data: { object: { id: disputeId, object: "dispute", charge: chargeId, payment_intent: paymentIntentId, amount: 2500, currency: "usd", status: "needs_response" } } };
  await Promise.all([webhook(webhookRequest()), webhook(new Request("http://localhost/api/stripe/webhook", { method: "POST", headers: { "stripe-signature": "verified-by-test-boundary" }, body: JSON.stringify({ ...eventToReturn, id: `evt_${runId}_updated_concurrent` }) }))]);
  check((await db.collection("stripeSponsorDisputes").doc(disputeId).get()).data()?.providerStatus === "under_review", "out-of-order event snapshots cannot override the retrieved current provider status");

  const adminRequest = (body, key) => new Request("http://localhost/api/admin/chargebacks", { method: "PATCH", headers: { authorization: `Bearer ${idToken}`, "content-type": "application/json", "idempotency-key": key }, body: JSON.stringify(body) });
  currentStatus = "lost";
  eventToReturn = { id: `evt_${runId}_closed_lost`, type: "charge.dispute.closed", created: Math.floor(Date.now() / 1000), data: { object: { id: disputeId } } };
  await webhook(webhookRequest());
  const lossAck = await reconcile(adminRequest({ caseId, action: "acknowledge_loss", reason: "Reviewed Stripe loss and preserved the hold without replacing funding.", confirmed: true }, `${runId}_loss_ack`));
  check(lossAck.status === 200, "single Admin can audibly acknowledge a verified loss");
  check((await db.collection("sponsorContributions").doc(contributionId).get()).data()?.stripeDisputeRestricted === true, "lost contribution remains restricted after acknowledgement");

  currentStatus = "won";
  eventToReturn = { id: `evt_${runId}_closed_won`, type: "charge.dispute.closed", created: Math.floor(Date.now() / 1000), data: { object: { id: disputeId } } };
  await webhook(webhookRequest());
  await db.collection("refundCases").doc(refundCaseId).set({ id: refundCaseId, paymentCollection: "sponsorContributions", paymentId: contributionId, status: "pending_review", amountCents: 10000, createdAt: new Date().toISOString() });
  const blockedRelease = await reconcile(adminRequest({ caseId, action: "release_won", reason: "Review found a separate refund hold that must remain active before funds can be released.", confirmed: true }, `${runId}_release_blocked`));
  check(blockedRelease.status === 409 && (await db.collection("sponsorContributions").doc(contributionId).get()).data()?.stripeDisputeRestricted === true, "a favorable dispute outcome does not release a contribution with a separate refund restriction");
  await db.collection("refundCases").doc(refundCaseId).delete();
  const release = await reconcile(adminRequest({ caseId, action: "release_won", reason: "Reviewed the current Stripe win and confirmed no other financial restriction remains.", confirmed: true }, `${runId}_release`));
  check(release.status === 200, "Admin reconciliation releases a provider-won case after rechecking other holds");
  check((await db.collection("sponsorContributions").doc(contributionId).get()).data()?.stripeDisputeRestricted === false, "won reconciliation clears the contribution restriction");
  check((await getConfirmedSponsorContributionForChallenge(db, challengeId)).grossAmountCents === 10000, "verified Admin reconciliation restores the eligible sponsor prize total after all holds clear");
  settlement = (await db.collection("challengeSettlements").doc(settlementId).get()).data();
  check(settlement.disputeRestricted === false && settlement.status === "created_pending_review", "settlement resumes its recorded prior review state");
  check((await db.collection("cashLedger").doc(paidLedgerId).get()).data()?.status === "paid_out", "reconciliation never reverses completed payout history");
  const duplicate = await reconcile(adminRequest({ caseId, action: "release_won", reason: "Reviewed the current Stripe win and confirmed no other financial restriction remains.", confirmed: true }, `${runId}_release`));
  check((await duplicate.json()).data?.duplicate === true, "duplicate Admin reconciliation is idempotent");
  const alternateRequestDuplicate = await reconcile(adminRequest({ caseId, action: "release_won", reason: "Repeated request with a new request key must not release or audit the same dispute twice.", confirmed: true }, `${runId}_release_new_key`));
  check((await alternateRequestDuplicate.json()).data?.duplicate === true, "a new client idempotency key cannot repeat a completed dispute release action");
  currentStatus = "won";
  const finalizedAfterAdminReview = await recordStripeSponsorDispute(db, {
    dispute: { id: disputeId, object: "dispute", charge: chargeId, payment_intent: paymentIntentId, amount: 2500, currency: "usd", status: "won", created: Math.floor(Date.now() / 1000) },
    charge: { id: chargeId, object: "charge", amount: 10000, currency: "usd", payment_intent: paymentIntentId },
    paymentIntent: { id: paymentIntentId, object: "payment_intent", amount: 10000, amount_received: 10000, currency: "usd", latest_charge: chargeId },
    eventId: `evt_${runId}_final_won_after_admin`, eventType: "charge.dispute.closed"
  });
  check(finalizedAfterAdminReview.restrictionActive === false, "provider event result reports the persisted released state after audited Admin reconciliation");
  check((await db.collection("sponsorContributions").doc(contributionId).get()).data()?.stripeDisputeRestricted === false, "late duplicate final provider event preserves the persisted Admin-released contribution restriction state");
  check((await getConfirmedSponsorContributionForChallenge(db, challengeId)).grossAmountCents === 10000, "late duplicate final provider event does not remove previously reconciled prize funds");
  check((await db.collection("challengeSettlements").doc(settlementId).get()).data()?.disputeRestricted === false, "late duplicate final provider event does not re-freeze the released settlement");
  await recordStripeSponsorDispute(db, {
    dispute: { id: disputeId, object: "dispute", charge: chargeId, payment_intent: paymentIntentId, amount: 2500, currency: "usd", status: "won", created: Math.floor(Date.now() / 1000) },
    charge: { id: chargeId, object: "charge", amount: 10000, currency: "usd", payment_intent: paymentIntentId },
    paymentIntent: { id: paymentIntentId, object: "payment_intent", amount: 10000, amount_received: 10000, currency: "usd", latest_charge: chargeId },
    eventId: `evt_${runId}_final_won_after_admin`, eventType: "charge.dispute.closed"
  });
  check((await db.collection("sponsorContributions").doc(contributionId).get()).data()?.stripeDisputeRestricted === false, "replaying the same final dispute event cannot restore a released contribution restriction");
  check((await db.collection("auditLogs").where("targetId", "==", disputeId).get()).size >= 2, "Admin loss and release decisions have durable audit records");

  eventToReturn = { id: `evt_${runId}_invalid_signature`, type: "charge.dispute.created", created: Math.floor(Date.now() / 1000), data: { object: { id: `${disputeId}_invalid` } } };
  stripe.webhooks.constructEvent = () => { throw new Error("invalid signature"); };
  const invalid = await webhook(webhookRequest());
  check(invalid.status === 400, "invalid Stripe signature cannot create a dispute case");

  console.log(`PASS Sponsor Stripe dispute emulator: ${assertions} assertions; linked partial dispute, transaction restrictions, payout denial, out-of-order provider refresh, loss hold, win release, idempotent audited Admin reconciliation, and signature rejection.`);
} finally {
  setStripeClientForTests(null);
  const collections = ["challenges", "sponsorContributions", "challengeSettlements", "cashLedger", "stripeSponsorDisputes", "chargebackCases", "adminActionTasks", "auditLogs", "refundCases", "users"];
  await Promise.all(collections.map(async (name) => {
    const field = name === "challenges" ? "id" : name === "users" ? "id" : name === "sponsorContributions" ? "challengeId" : name === "challengeSettlements" ? "challengeId" : name === "cashLedger" ? "settlementId" : name === "stripeSponsorDisputes" ? "id" : name === "chargebackCases" ? "stripeDisputeId" : name === "adminActionTasks" ? "targetId" : name === "auditLogs" ? "targetId" : name === "refundCases" ? "paymentId" : "id";
    const value = name === "challenges" || name === "sponsorContributions" || name === "challengeSettlements" ? challengeId
      : name === "users" ? admin.uid : name === "cashLedger" ? settlementId
        : name === "stripeSponsorDisputes" ? disputeId : name === "chargebackCases" ? disputeId : name === "adminActionTasks" ? disputeId : name === "auditLogs" ? disputeId : name === "refundCases" ? contributionId : "";
    const snapshot = name === "users" ? await db.collection(name).doc(admin.uid).get() : await db.collection(name).where(field, "==", value).get();
    const refs = "docs" in snapshot ? snapshot.docs.map((doc) => doc.ref) : snapshot.exists ? [snapshot.ref] : [];
    await Promise.all(refs.map((ref) => ref.delete()));
  }));
  await Promise.all([...providerEventIds].map((eventId) => db.collection("stripeWebhookEvents").doc(eventId).delete().catch(() => undefined)));
  await Promise.all(paginationFixtureIds.map((id) => db.collection("chargebackCases").doc(id).delete().catch(() => undefined)));
  const mismatchedCaseSnapshot = await db.collection("chargebackCases").where("stripeDisputeId", "==", mismatchedDisputeId).get();
  await Promise.all(mismatchedCaseSnapshot.docs.flatMap((doc) => [doc.ref.delete(), db.collection("adminActionTasks").doc(doc.id).delete()]));
  await db.collection("stripeSponsorDisputes").doc(mismatchedDisputeId).delete();
  await adminAuth.deleteUser(admin.uid);
  await app.delete();
}
