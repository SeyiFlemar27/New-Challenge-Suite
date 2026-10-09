import assert from "node:assert/strict";
import Stripe from "stripe";
import { initializeApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import { getAuth } from "firebase-admin/auth";
import { setStripeClientForTests } from "../lib/stripe.ts";

assert.ok(process.env.FIRESTORE_EMULATOR_HOST, "FIRESTORE_EMULATOR_HOST is required");
assert.ok(process.env.FIREBASE_AUTH_EMULATOR_HOST, "FIREBASE_AUTH_EMULATOR_HOST is required");
process.env.STRIPE_SECRET_KEY ??= "sk_test_deterministic_payment_return";
process.env.STRIPE_WEBHOOK_SECRET ??= "whsec_deterministic_payment_return";
const app = initializeApp({ projectId: process.env.FIREBASE_PROJECT_ID ?? "demo-challenge-suite" });
const db = getFirestore(app);
const runId = `payment_return_${Date.now()}_${Math.random().toString(36).slice(2)}`;
const sessionId = `cs_${runId}`;
let userId;
let otherUserId;
const purchaseId = `${runId}_purchase`;
const challengeId = `${runId}_enterprise_challenge`;
const organizationId = `${runId}_org`;
const creatorSessionId = `cs_${runId}_creator_prize`;
let createdCreatorSession;
const sponsorChallengeId = `${runId}_sponsor_challenge`;
const sponsorOrgId = `${runId}_sponsor_org`;
const sponsorSessionId = `cs_${runId}_sponsor_funding`;
const foreignSponsorContributionId = `${runId}_foreign_sponsor_contribution`;
let sponsorUserId;
let sponsorToken;
let createdSponsorSession;
const participantChallengeId = `${runId}_paid_entry_challenge`;
const paidEntryRequestId = `${runId}_paid_entry_request`;
const participantSessionId = `cs_${runId}_paid_entry`;
let participantUserId;
let participantToken;
let createdEntrySession;
let adminUserId;
let adminToken;
let promotionalFundingId;
let refundCaseId;
const withdrawalId = `${runId}_withdrawal`;
const paidVoteRefundId = `${runId}_paid_vote_refund_source`;
const paidVoteCreditId = `${runId}_paid_vote_refund_credit`;
const paidVoteLedgerId = `${runId}_paid_vote_refund_ledger`;
const settlementChallengeId = `${runId}_settlement_lock_challenge`;
const settlementFundingId = `${runId}_settlement_lock_funding`;
const settlementProposalId = `${runId}_settlement_lock_proposal`;
const settlementSubmissionId = `${runId}_settlement_lock_submission`;
const settlementRefundCaseId = `refund_creatorPrizeFundingPayments_${settlementFundingId}`;
let fundingId;
let creatorLedgerRefs = [];
let sponsorContributionId;
let sponsorLedgerRefs = [];
let entryPaymentId;
let entryLedgerRefs = [];
const key = "fake-api-key";

async function signUp(uid, email) {
  const response = await fetch(`http://${process.env.FIREBASE_AUTH_EMULATOR_HOST}/identitytoolkit.googleapis.com/v1/accounts:signUp?key=${key}`, {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ email, password: "A-strong-test-password-123!", returnSecureToken: true }),
  });
  const body = await response.json();
  assert.equal(response.ok, true, JSON.stringify(body));
  return { idToken: body.idToken, localId: body.localId };
}

function request(url, token) {
  return new Request(url, { headers: { authorization: `Bearer ${token}` } });
}

try {
  const [owner, other, sponsor, participant, admin] = await Promise.all([
    signUp("owner", `${runId}_owner@example.test`), signUp("other", `${runId}_other@example.test`), signUp("sponsor", `${runId}_sponsor@example.test`), signUp("participant", `${runId}_participant@example.test`), signUp("admin", `${runId}_admin@example.test`),
  ]);
  userId = owner.localId;
  otherUserId = other.localId;
  const ownerToken = owner.idToken;
  const otherToken = other.idToken;
  sponsorUserId = sponsor.localId;
  sponsorToken = sponsor.idToken;
  participantUserId = participant.localId;
  participantToken = participant.idToken;
  adminUserId = admin.localId;
  adminToken = admin.idToken;
  await Promise.all([
    db.collection("users").doc(userId).set({ emailVerified: true }, { merge: true }),
    db.collection("users").doc(otherUserId).set({ emailVerified: true }, { merge: true }),
    db.collection("users").doc(sponsorUserId).set({ emailVerified: true, accountType: "sponsor" }, { merge: true }),
    db.collection("users").doc(participantUserId).set({ emailVerified: true, accountType: "user", planId: "free", planStatus: "active" }, { merge: true }),
    db.collection("users").doc(adminUserId).set({ emailVerified: true, adminRoles: ["super_admin"], adminAccessStatus: "active", adminSecuritySetupComplete: true }, { merge: true }),
    db.collection("profiles").doc(sponsorUserId).set({ accountType: "sponsor", sponsorOrganizationId: sponsorOrgId }, { merge: true }),
    db.collection("sponsorProfiles").doc(sponsorOrgId).set({ sponsorOrganizationId: sponsorOrgId, sponsorVerificationStatus: "approved", subscriptionStatus: "active", sponsorOnboardingComplete: true }),
  ]);
  await getAuth(app).verifyIdToken(ownerToken);
  const stripe = new Stripe(process.env.STRIPE_SECRET_KEY ?? "sk_test_deterministic");
  const voteSession = {
    id: sessionId, mode: "payment", status: "complete", payment_status: "paid", amount_total: 1200,
    currency: "usd", metadata: { paymentPurpose: "paid_vote", votePurchaseId: purchaseId, userId },
    line_items: { data: [{ description: "Votes", quantity: 2, amount_total: 1200, currency: "usd" }] },
  };
  stripe.checkout.sessions.retrieve = async (requestedId, options) => {
    if (requestedId === creatorSessionId) return { ...createdCreatorSession, line_items: { data: [] } };
    if (requestedId === sponsorSessionId) return { ...createdSponsorSession, line_items: { data: [] } };
    if (requestedId === participantSessionId) return { ...createdEntrySession, line_items: { data: [] } };
    assert.equal(requestedId, sessionId);
    assert.deepEqual(options, { expand: ["line_items"] });
    return voteSession;
  };
  stripe.checkout.sessions.create = async (params) => {
    const isSponsor = params.metadata.paymentPurpose === "sponsor_funding";
    const isEntry = params.metadata.paymentPurpose === "challenge_entry_fee";
    const session = {
      id: isSponsor ? sponsorSessionId : isEntry ? participantSessionId : creatorSessionId, mode: "payment", status: "complete", payment_status: "paid",
      amount_total: params.line_items[0].price_data.unit_amount, currency: "usd",
      payment_intent: `pi_${runId}_${isSponsor ? "sponsor" : isEntry ? "entry" : "creator_prize"}`, metadata: params.metadata,
    };
    if (isSponsor) createdSponsorSession = session;
    else if (isEntry) createdEntrySession = session;
    else createdCreatorSession = session;
    return { ...session, url: "https://checkout.test/session" };
  };
  let providerRefundCalls = 0;
  let failNextProviderRefund = false;
  const providerRefundIdempotencyKeys = [];
  stripe.refunds.create = async (params, options) => {
    providerRefundCalls += 1;
    assert.match(String(params.payment_intent), new RegExp(`^pi_${runId}_`));
    assert.ok(options.idempotencyKey);
    providerRefundIdempotencyKeys.push(options.idempotencyKey);
    if (failNextProviderRefund) {
      failNextProviderRefund = false;
      throw new Error("Deterministic transient Stripe refund failure");
    }
    return { id: `re_${params.metadata.refundCaseId}`, status: "succeeded" };
  };
  setStripeClientForTests(stripe);
  await db.collection("paidVotePurchases").doc(purchaseId).set({ id: purchaseId, userId, amountCents: 1200, currency: "USD", status: "pending", paymentPurpose: "paid_vote", providerSessionId: sessionId });
  await db.collection("users").doc(userId).set({
    enterpriseAccessStatus: "approved", enterpriseRole: "finance", enterprisePermissions: ["finance.prepare", "finance.view", "participants.manage"], enterpriseScope: "all_official",
    enterpriseOrganizationId: organizationId, emailVerified: true,
  }, { merge: true });
  await db.collection("challenges").doc(challengeId).set({
    id: challengeId, title: "Emulator creator funding", creatorId: userId, status: "draft",
    officialChallenge: true, ownershipType: "challenge_suite_official", organizationOwnerId: organizationId,
    category: "art", region: "US", prizeValue: 0,
  });

  const { GET: verifyCheckout } = await import("../app/api/verify-checkout/route.ts");
  const valid = await verifyCheckout(request(`http://localhost/api/verify-checkout?session_id=${sessionId}&purpose=vote_purchase`, ownerToken));
  assert.equal(valid.status, 200, await valid.clone().text());
  const validBody = await valid.json();
  assert.equal(validBody.data?.purpose ?? validBody.purpose, "vote_purchase");
  const tampered = await verifyCheckout(request(`http://localhost/api/verify-checkout?session_id=${sessionId}&purpose=prize_pool_funding`, ownerToken));
  assert.equal(tampered.status, 400);
  const wrongOwner = await verifyCheckout(request(`http://localhost/api/verify-checkout?session_id=${sessionId}`, otherToken));
  assert.equal(wrongOwner.status, 404);
  const purchaseAfterVerify = (await db.collection("paidVotePurchases").doc(purchaseId).get()).data();
  assert.equal(purchaseAfterVerify.status, "pending", "verify-checkout must not perform the payment mutation");

  const { GET: paymentStatus } = await import("../app/api/payments/status/route.ts");
  const ownStatus = await paymentStatus(request(`http://localhost/api/payments/status?purpose=vote_purchase&reference=${purchaseId}`, ownerToken));
  assert.equal(ownStatus.status, 200, await ownStatus.clone().text());
  const foreignStatus = await paymentStatus(request(`http://localhost/api/payments/status?purpose=vote_purchase&reference=${purchaseId}`, otherToken));
  assert.equal(foreignStatus.status, 200);
  const foreignBody = await foreignStatus.json();
  assert.equal(foreignBody.data?.state ?? foreignBody.state, "processing");
  assert.equal(foreignBody.data?.providerReference, null);
  assert.equal((await db.collection("paidVotePurchases").doc(purchaseId).get()).data().status, "pending");
  const { POST: paidVoteCheckout } = await import("../app/api/challenges/[id]/paid-votes/checkout/route.ts");
  const retiredPaidVoteCheckout = await paidVoteCheckout(new Request("http://localhost/api/challenges/retired/paid-votes/checkout", { method: "POST" }), { params: Promise.resolve({ id: "retired" }) });
  assert.equal(retiredPaidVoteCheckout.status, 410);

  const { POST: createPrizeCheckout } = await import("../app/api/challenges/[id]/prize-funding/checkout/route.ts");
  const checkout = await createPrizeCheckout(new Request("http://localhost/api/challenges/test/prize-funding/checkout", {
    method: "POST", headers: { authorization: `Bearer ${ownerToken}`, "content-type": "application/json" },
    body: JSON.stringify({ amountCents: 5000 }),
  }), { params: Promise.resolve({ id: challengeId }) });
  assert.equal(checkout.status, 200, await checkout.clone().text());
  const checkoutBody = await checkout.json();
  fundingId = checkoutBody.data?.prizeFundingId ?? checkoutBody.prizeFundingId;
  const pendingFunding = (await db.collection("creatorPrizeFundingPayments").doc(fundingId).get()).data();
  assert.equal(pendingFunding.status, "pending");
  assert.equal(pendingFunding.organizationOwnerId, organizationId);
  assert.equal(pendingFunding.providerSessionId, creatorSessionId);

  const stripeEvent = (id, checkoutSession = createdCreatorSession) => ({
    id, object: "event", api_version: "2025-02-24.acacia", created: Math.floor(Date.now() / 1000),
    livemode: false, pending_webhooks: 1, request: null, type: "checkout.session.completed",
    data: { object: checkoutSession, previous_attributes: null },
  });
  const sendWebhook = async (event) => {
    const payload = JSON.stringify(event);
    const signature = stripe.webhooks.generateTestHeaderString({ payload, secret: process.env.STRIPE_WEBHOOK_SECRET });
    const { POST } = await import("../app/api/stripe/webhook/route.ts");
    return POST(new Request("http://localhost/api/stripe/webhook", { method: "POST", headers: { "content-type": "application/json", "stripe-signature": signature }, body: payload }));
  };
  const creatorReturnFirst = await verifyCheckout(request(`http://localhost/api/verify-checkout?session_id=${creatorSessionId}`, ownerToken));
  assert.equal(creatorReturnFirst.status, 200, await creatorReturnFirst.clone().text());
  const firstWebhook = await sendWebhook(stripeEvent(`${runId}_creator_event`));
  assert.equal(firstWebhook.status, 200, await firstWebhook.clone().text());
  const retryWebhook = await sendWebhook(stripeEvent(`${runId}_creator_retry_event`));
  assert.equal(retryWebhook.status, 200, await retryWebhook.clone().text());
  const confirmedFunding = (await db.collection("creatorPrizeFundingPayments").doc(fundingId).get()).data();
  const exposure = (await db.collection("enterprisePrizeFundingLimits").doc(challengeId).get()).data();
  const creatorLedgers = await db.collection("challengeFinancialLedger").where("transactionId", "==", fundingId).get();
  creatorLedgerRefs = creatorLedgers.docs.map((doc) => doc.ref);
  assert.equal(confirmedFunding.status, "confirmed");
  assert.equal(confirmedFunding.organizationOwnerId, organizationId);
  assert.equal(exposure.exposureCents, 5000);
  assert.equal(creatorLedgers.size, 1);
  assert.equal(creatorLedgers.docs[0].data().organizationOwnerId, organizationId);
  assert.equal((await db.collection("cashWallets").doc(userId).get()).exists, false);
  const { POST: promotionalFunding } = await import("../app/api/admin/challenges/[id]/promotional-prize-funding/route.ts");
  const promoRequest = () => new Request("http://localhost/api/admin/challenges/test/promotional-prize-funding", {
    method: "POST", headers: { authorization: `Bearer ${adminToken}`, "content-type": "application/json", "idempotency-key": `${runId}_promo_key` },
    body: JSON.stringify({ amountCents: 1000, reason: "Deterministic Enterprise promotional funding test" }),
  });
  const promoResponse = await promotionalFunding(promoRequest(), { params: Promise.resolve({ id: challengeId }) });
  assert.equal(promoResponse.status, 200, await promoResponse.clone().text());
  const promoBody = await promoResponse.json();
  promotionalFundingId = promoBody.data?.funding?.id ?? promoBody.funding?.id;
  const promoRetry = await promotionalFunding(promoRequest(), { params: Promise.resolve({ id: challengeId }) });
  assert.equal(promoRetry.status, 200, await promoRetry.clone().text());
  assert.equal((await promoRetry.json()).data?.idempotent, true);
  const promoExposure = (await db.collection("enterprisePrizeFundingLimits").doc(challengeId).get()).data();
  assert.equal(promoExposure.exposureCents, 6000);
  assert.equal((await db.collection("enterprisePromotionalPrizeFunding").doc(promotionalFundingId).get()).data()?.organizationOwnerId, organizationId);
  const promoAudit = await db.collection("auditLogs").where("targetId", "==", challengeId).where("action", "==", "enterprise.prize_promotional_funding_confirmed").get();
  assert.equal(promoAudit.docs.some((doc) => doc.data().actorId === adminUserId && Boolean(doc.data().reason)), true);
  const { POST: createRefundCase, PATCH: updateRefundCase } = await import("../app/api/admin/refunds/route.ts");
  async function executeAdminRefund(paymentCollection, paymentId, label, { failOnce = false, failLocalFinalizeOnce = false } = {}) {
    const created = await createRefundCase(new Request("http://localhost/api/admin/refunds", {
      method: "POST", headers: { authorization: `Bearer ${adminToken}`, "content-type": "application/json" },
      body: JSON.stringify({ paymentCollection, paymentId, reason: `Deterministic ${label} refund case` }),
    }));
    assert.equal(created.status, 200, await created.clone().text());
    const createdBody = await created.json();
    const id = createdBody.data?.id ?? createdBody.id;
    const record = (await db.collection("refundCases").doc(id).get()).data();
    assert.ok(record.organizationOwnerId);
    const approved = await updateRefundCase(new Request("http://localhost/api/admin/refunds", {
      method: "PATCH", headers: { authorization: `Bearer ${adminToken}`, "content-type": "application/json" },
      body: JSON.stringify({ refundCaseId: id, action: "approve", reason: `Approve ${label} refund` }),
    }));
    assert.equal(approved.status, 200, await approved.clone().text());
    if (failOnce) {
      failNextProviderRefund = true;
      const failedAttempt = await updateRefundCase(new Request("http://localhost/api/admin/refunds", {
        method: "PATCH", headers: { authorization: `Bearer ${adminToken}`, "content-type": "application/json" },
        body: JSON.stringify({ refundCaseId: id, action: "execute", reason: `First provider attempt ${label} refund` }),
      }));
      assert.equal(failedAttempt.status, 500, await failedAttempt.clone().text());
      assert.equal((await db.collection("refundCases").doc(id).get()).data().status, "approved");
    }
    let providerCallsAfterLocalFailure;
    if (failLocalFinalizeOnce) {
      const originalRunTransaction = db.runTransaction.bind(db);
      let transactionCount = 0;
      db.runTransaction = (...args) => {
        transactionCount += 1;
        // The route first claims the challenge refund lock; fail the following
        // source reversal transaction after the provider has succeeded.
        if (transactionCount === 2) {
          db.runTransaction = originalRunTransaction;
          return Promise.reject(new Error("Deterministic Firestore finalization failure after provider success"));
        }
        return originalRunTransaction(...args);
      };
      const providerCallsBefore = providerRefundCalls;
      const failedFinalize = await updateRefundCase(new Request("http://localhost/api/admin/refunds", {
        method: "PATCH", headers: { authorization: `Bearer ${adminToken}`, "content-type": "application/json" },
        body: JSON.stringify({ refundCaseId: id, action: "execute", reason: `Provider succeeded before local failure ${label}` }),
      }));
      db.runTransaction = originalRunTransaction;
      assert.equal(failedFinalize.status, 500, await failedFinalize.clone().text());
      assert.equal(providerRefundCalls, providerCallsBefore + 1);
      providerCallsAfterLocalFailure = providerRefundCalls;
      assert.equal((await db.collection("refundCases").doc(id).get()).data().status, "processing");
      assert.equal((await db.collection("cashLedger").doc(`refund_${id}`).get()).exists, false);
      assert.equal((await db.collection("paidVotePurchases").doc(paymentId).get()).data()?.status, "confirmed");
    }
    const executed = await updateRefundCase(new Request("http://localhost/api/admin/refunds", {
      method: "PATCH", headers: { authorization: `Bearer ${adminToken}`, "content-type": "application/json" },
      body: JSON.stringify({ refundCaseId: id, action: "execute", reason: `Execute ${label} refund` }),
    }));
    assert.equal(executed.status, 200, await executed.clone().text());
    if (failOnce) {
      assert.equal((await db.collection("refundCases").doc(id).get()).data().status, "succeeded");
      assert.equal(providerRefundIdempotencyKeys.at(-1), providerRefundIdempotencyKeys.at(-2));
    }
    if (failLocalFinalizeOnce) {
      assert.equal((await db.collection("refundCases").doc(id).get()).data().status, "succeeded");
      assert.equal(providerRefundCalls, providerCallsAfterLocalFailure + 1);
      assert.equal(providerRefundIdempotencyKeys.at(-1), providerRefundIdempotencyKeys.at(-2));
      const repairedCashLedger = await db.collection("cashLedger").doc(`refund_${id}`).get();
      assert.equal(repairedCashLedger.data()?.status, "posted");
      assert.equal(repairedCashLedger.data()?.organizationOwnerId, organizationId);
      await repairedCashLedger.ref.delete();
      const providerCallsBeforeLedgerRepair = providerRefundCalls;
      const ledgerRepairRetry = await updateRefundCase(new Request("http://localhost/api/admin/refunds", {
        method: "PATCH", headers: { authorization: `Bearer ${adminToken}`, "content-type": "application/json" },
        body: JSON.stringify({ refundCaseId: id, action: "execute", reason: `Repair missing ledger ${label} refund` }),
      }));
      assert.equal(ledgerRepairRetry.status, 200, await ledgerRepairRetry.clone().text());
      assert.equal(providerRefundCalls, providerCallsBeforeLedgerRepair);
      assert.equal((await db.collection("cashLedger").doc(`refund_${id}`).get()).data()?.status, "posted");
    }
    return id;
  }
  const refundCreate = await createRefundCase(new Request("http://localhost/api/admin/refunds", {
    method: "POST", headers: { authorization: `Bearer ${adminToken}`, "content-type": "application/json" },
    body: JSON.stringify({ paymentCollection: "creatorPrizeFundingPayments", paymentId: fundingId, reason: "Deterministic Enterprise refund route test" }),
  }));
  assert.equal(refundCreate.status, 200, await refundCreate.clone().text());
  const refundBody = await refundCreate.json();
  refundCaseId = refundBody.data?.id ?? refundBody.id;
  const refundPending = (await db.collection("refundCases").doc(refundCaseId).get()).data();
  assert.equal(refundPending.organizationOwnerId, organizationId);
  assert.equal(refundPending.challengeId, challengeId);
  assert.equal(refundPending.financialOwnerType, "organization");
  const refundApprove = await updateRefundCase(new Request("http://localhost/api/admin/refunds", {
    method: "PATCH", headers: { authorization: `Bearer ${adminToken}`, "content-type": "application/json" },
    body: JSON.stringify({ refundCaseId, action: "approve", reason: "Approved deterministic refund case" }),
  }));
  assert.equal(refundApprove.status, 200, await refundApprove.clone().text());
  const refundExecute = await updateRefundCase(new Request("http://localhost/api/admin/refunds", {
    method: "PATCH", headers: { authorization: `Bearer ${adminToken}`, "content-type": "application/json" },
    body: JSON.stringify({ refundCaseId, action: "execute", reason: "Execute deterministic refund" }),
  }));
  assert.equal(refundExecute.status, 200, await refundExecute.clone().text());
  const refundRetry = await updateRefundCase(new Request("http://localhost/api/admin/refunds", {
    method: "PATCH", headers: { authorization: `Bearer ${adminToken}`, "content-type": "application/json" },
    body: JSON.stringify({ refundCaseId, action: "execute", reason: "Retry deterministic refund" }),
  }));
  assert.equal(refundRetry.status, 200, await refundRetry.clone().text());
  assert.equal(providerRefundCalls, 1);
  const completedRefund = (await db.collection("refundCases").doc(refundCaseId).get()).data();
  const refundedCreatorPayment = (await db.collection("creatorPrizeFundingPayments").doc(fundingId).get()).data();
  const refundLedger = await db.collection("challengeFinancialLedger").doc(`enterprise_refund_${refundCaseId}`).get();
  assert.equal(completedRefund.status, "succeeded");
  assert.equal(completedRefund.organizationOwnerId, organizationId);
  assert.equal(refundedCreatorPayment.status, "refunded");
  assert.equal(refundLedger.exists, true);
  await db.collection("paidVotePurchases").doc(purchaseId).set({ status: "confirmed", providerConfirmed: true, organizationOwnerId: organizationId, challengeId, stripePaymentIntentId: `pi_${runId}_paid_vote`, winnerShareCents: 780, creatorHostOperatorShareCents: 240, platformFeeCents: 180 }, { merge: true });
  const paidVoteRefundId = await executeAdminRefund("paidVotePurchases", purchaseId, "paid-vote-local-finalize-retry", { failLocalFinalizeOnce: true });
  assert.equal((await db.collection("refundCases").doc(paidVoteRefundId).get()).data().status, "succeeded");
  assert.equal((await db.collection("enterprisePrizeFundingLimits").doc(challengeId).get()).data().exposureCents, 6000);
  const sendRefundWebhook = async (eventId) => {
    const event = {
      id: eventId, object: "event", api_version: "2025-02-24.acacia", created: Math.floor(Date.now() / 1000),
      livemode: false, pending_webhooks: 1, request: null, type: "refund.updated",
      data: { object: { id: `re_${runId}_creator_refund`, object: "refund", status: "succeeded", payment_intent: `pi_${runId}_creator_prize`, metadata: { refundCaseId } }, previous_attributes: null },
    };
    const payload = JSON.stringify(event);
    const signature = stripe.webhooks.generateTestHeaderString({ payload, secret: process.env.STRIPE_WEBHOOK_SECRET });
    const { POST } = await import("../app/api/stripe/webhook/route.ts");
    return POST(new Request("http://localhost/api/stripe/webhook", { method: "POST", headers: { "content-type": "application/json", "stripe-signature": signature }, body: payload }));
  };
  const delayedRefundEvent = await sendRefundWebhook(`${runId}_refund_updated_event`);
  assert.equal(delayedRefundEvent.status, 200, await delayedRefundEvent.clone().text());
  const duplicateRefundEvent = await sendRefundWebhook(`${runId}_refund_updated_event`);
  assert.equal(duplicateRefundEvent.status, 200);
  const distinctRefundRetry = await sendRefundWebhook(`${runId}_refund_updated_retry_event`);
  assert.equal(distinctRefundRetry.status, 200, await distinctRefundRetry.clone().text());
  assert.equal((await db.collection("refundCases").doc(refundCaseId).get()).data().status, "succeeded");
  assert.equal((await db.collection("creatorPrizeFundingPayments").doc(fundingId).get()).data().status, "refunded");
  assert.equal((await db.collection("challengeFinancialLedger").doc(`enterprise_refund_${refundCaseId}`).get()).exists, true);
  await db.collection("withdrawalRequests").doc(withdrawalId).set({ id: withdrawalId, userId, amountCents: 700, currency: "USD", status: "pending_review", kycStatus: "pending", sourceIds: [] });
  await db.collection("cashWallets").doc(userId).set({ userId, availableBalanceCents: 200, underReviewBalanceCents: 700, lockedBalanceCents: 700, withdrawnBalanceCents: 0 });
  const { PATCH: adminOperation } = await import("../app/api/admin/operations/route.ts");
  const withdrawalReject = await adminOperation(new Request("http://localhost/api/admin/operations", {
    method: "PATCH", headers: { authorization: `Bearer ${adminToken}`, "content-type": "application/json" },
    body: JSON.stringify({ type: "withdrawal", id: withdrawalId, action: "reject", reason: "Deterministic personal withdrawal review" }),
  }));
  assert.equal(withdrawalReject.status, 200, await withdrawalReject.clone().text());
  assert.equal((await db.collection("withdrawalRequests").doc(withdrawalId).get()).data().status, "rejected");
  const rejectedWithdrawalWallet = (await db.collection("cashWallets").doc(userId).get()).data();
  assert.equal(rejectedWithdrawalWallet.availableBalanceCents, 900);
  assert.equal(rejectedWithdrawalWallet.underReviewBalanceCents, 0);
  const withdrawalLedger = await db.collection("cashLedger").doc(`${withdrawalId}_rejected`).get();
  assert.equal(withdrawalLedger.exists, true);
  assert.equal(withdrawalLedger.data().userId, userId);
  assert.equal(withdrawalLedger.data().metadata.externalPayoutExecuted, false);
  const voteRefundChallengeBefore = (await db.collection("challenges").doc(challengeId).get()).data();
  await db.collection("challenges").doc(challengeId).set({
    confirmedPaidVoteGrossCents: 1000, confirmedPaidVoteWinnerShareCents: 650,
    confirmedPaidVoteCreatorHostOperatorShareCents: 200, confirmedPaidVotePlatformAdminShareCents: 150,
  }, { merge: true });
  await db.collection("paidVotePurchases").doc(paidVoteRefundId).set({
    id: paidVoteRefundId, userId: otherUserId, challengeId, organizationOwnerId: organizationId, financialOwnerType: "organization",
    amountCents: 1000, currency: "USD", paymentPurpose: "paid_vote", status: "confirmed", webhookConfirmed: true,
    providerPaymentIntentId: `pi_${runId}_paid_vote_refund`, stripePaymentIntentId: `pi_${runId}_paid_vote_refund`,
    winnerShareCents: 650, creatorHostOperatorShareCents: 200, platformFeeCents: 150,
  });
  await db.collection("paidVoteCredits").doc(paidVoteCreditId).set({ id: paidVoteCreditId, purchaseId: paidVoteRefundId, userId: otherUserId, challengeId, status: "active", votesGranted: 2, votesRemaining: 2 });
  await db.collection("challengeFinancialLedger").doc(paidVoteLedgerId).set({ id: paidVoteLedgerId, paidVotePurchaseId: paidVoteRefundId, challengeId, organizationOwnerId: organizationId, amountCents: 1000, status: "confirmed" });
  const paidVoteRefundCaseId = await executeAdminRefund("paidVotePurchases", paidVoteRefundId, "paid vote revenue");
  const paidVoteAfterRefund = (await db.collection("paidVotePurchases").doc(paidVoteRefundId).get()).data();
  assert.equal(paidVoteAfterRefund.status, "refunded");
  assert.equal((await db.collection("paidVoteCredits").doc(paidVoteCreditId).get()).data().votesRemaining, 0);
  assert.equal((await db.collection("challengeFinancialLedger").doc(paidVoteLedgerId).get()).data().status, "refunded");
  const voteRefundChallengeAfter = (await db.collection("challenges").doc(challengeId).get()).data();
  assert.equal(voteRefundChallengeAfter.confirmedPaidVoteGrossCents, 0);
  assert.equal((await db.collection("enterprisePrizeFundingLimits").doc(challengeId).get()).data().exposureCents, 6000);
  assert.equal((await db.collection("cashLedger").doc(`refund_${paidVoteRefundCaseId}`).get()).data().organizationOwnerId, organizationId);
  const verifiedCreatorCheckout = await verifyCheckout(request(`http://localhost/api/verify-checkout?session_id=${creatorSessionId}`, ownerToken));
  assert.equal(verifiedCreatorCheckout.status, 200, await verifiedCreatorCheckout.clone().text());

  await db.collection("challenges").doc(sponsorChallengeId).set({
    id: sponsorChallengeId, title: "Emulator sponsor funding", creatorId: userId, status: "active", visibility: "public", sponsorEnabled: true,
    officialChallenge: true, ownershipType: "challenge_suite_official", organizationOwnerId: organizationId,
    category: "art", region: "US", prizeValue: 0,
  });
  const creatorWalletBeforeSponsorFunding = (await db.collection("cashWallets").doc(userId).get()).data();
  const { POST: createSponsorCheckout } = await import("../app/api/sponsor/challenges/[id]/funding-checkout/route.ts");
  const unagreedSponsorCheckout = await createSponsorCheckout(new Request("http://localhost/api/sponsor/challenges/test/funding-checkout", {
    method: "POST", headers: { authorization: `Bearer ${sponsorToken}`, "content-type": "application/json", "idempotency-key": `${runId}_sponsor_unagreed` },
    body: JSON.stringify({ amountCents: 2500, placements: [] }),
  }), { params: Promise.resolve({ id: sponsorChallengeId }) });
  assert.equal(unagreedSponsorCheckout.status, 400, "commercial Sponsor funding cannot start without an agreement ID");
  const sponsorAgreementId = `sponsor_opportunity_${sponsorChallengeId}_${sponsorOrgId}`;
  await db.collection("sponsorChallengeAgreements").doc(sponsorAgreementId).set({
    id: sponsorAgreementId, challengeId: sponsorChallengeId, creatorId: userId, sponsorId: sponsorOrgId, sponsorOrganizationId: sponsorOrgId,
    status: "accepted", fundingStatus: "not_started", termsVersion: 1, creatorAcceptedVersion: 1, sponsorAcceptedVersion: 1,
    terms: { amountCents: 2500, currency: "USD", placements: ["challenge_detail"], ctaText: "Visit sponsor", ctaUrl: "https://sponsor.example.test", deliverables: [], durationStart: null, durationEnd: null },
    createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
  });
  const sponsorCheckout = await createSponsorCheckout(new Request("http://localhost/api/sponsor/challenges/test/funding-checkout", {
    method: "POST", headers: { authorization: `Bearer ${sponsorToken}`, "content-type": "application/json", "idempotency-key": `${runId}_sponsor_key` },
    body: JSON.stringify({ agreementId: sponsorAgreementId }),
  }), { params: Promise.resolve({ id: sponsorChallengeId }) });
  assert.equal(sponsorCheckout.status, 200, await sponsorCheckout.clone().text());
  const sponsorCheckoutBody = await sponsorCheckout.json();
  sponsorContributionId = sponsorCheckoutBody.data?.sponsorContributionId ?? sponsorCheckoutBody.sponsorContributionId;
  const pendingSponsorFunding = (await db.collection("sponsorContributions").doc(sponsorContributionId).get()).data();
  assert.equal(pendingSponsorFunding.status, "pending");
  assert.equal(pendingSponsorFunding.sponsorId, sponsorOrgId);
  assert.equal(pendingSponsorFunding.organizationOwnerId, organizationId);
  assert.equal(createdSponsorSession.metadata.sponsorContributionId, sponsorContributionId);
  const sponsorWebhook = await sendWebhook(stripeEvent(`${runId}_sponsor_event`, createdSponsorSession));
  assert.equal(sponsorWebhook.status, 200, await sponsorWebhook.clone().text());
  const sponsorRetryWebhook = await sendWebhook(stripeEvent(`${runId}_sponsor_retry_event`, createdSponsorSession));
  assert.equal(sponsorRetryWebhook.status, 200, await sponsorRetryWebhook.clone().text());
  const confirmedSponsorFunding = (await db.collection("sponsorContributions").doc(sponsorContributionId).get()).data();
  const sponsorExposure = (await db.collection("enterprisePrizeFundingLimits").doc(sponsorChallengeId).get()).data();
  const sponsorLedgers = await db.collection("challengeFinancialLedger").where("sponsorContributionId", "==", sponsorContributionId).get();
  sponsorLedgerRefs = sponsorLedgers.docs.map((doc) => doc.ref);
  assert.equal(confirmedSponsorFunding.status, "confirmed");
  assert.equal(confirmedSponsorFunding.sponsorId, sponsorOrgId);
  assert.equal(confirmedSponsorFunding.organizationOwnerId, organizationId);
  assert.equal(sponsorExposure.exposureCents, 2500);
  assert.equal(sponsorLedgers.size, 1);
  assert.equal(sponsorLedgers.docs[0].data().organizationOwnerId, organizationId);
  assert.equal(sponsorLedgers.docs[0].data().financialOwnerType, "organization");
  assert.equal((await db.collection("sponsorChallengeAgreements").doc(sponsorAgreementId).get()).data().fundingStatus, "confirmed");
  const linkedSponsorship = await db.collection("sponsorships").doc(`sponsorship_agreement_${sponsorAgreementId}`).get();
  assert.equal(linkedSponsorship.exists, true, "confirmed payment creates the linked sponsorship record");
  assert.equal(linkedSponsorship.data().status, "pending_admin_review", "confirmed funding enters the existing Admin placement review queue");
  assert.equal(linkedSponsorship.data().placementStatus, "pending_review", "confirmed funding does not bypass placement approval");
  assert.deepEqual((await db.collection("cashWallets").doc(userId).get()).data(), creatorWalletBeforeSponsorFunding);
  const verifiedSponsorCheckout = await verifyCheckout(request(`http://localhost/api/verify-checkout?session_id=${sponsorSessionId}`, sponsorToken));
  assert.equal(verifiedSponsorCheckout.status, 200, await verifiedSponsorCheckout.clone().text());
  const verifiedSponsorBody = await verifiedSponsorCheckout.json();
  assert.equal(verifiedSponsorBody.data?.purpose, "sponsor_contribution");
  assert.equal(verifiedSponsorBody.data?.resourceId, sponsorContributionId);
  await db.collection("sponsorContributions").doc(foreignSponsorContributionId).set({
    id: foreignSponsorContributionId, sponsorId: `${runId}_org_b`, organizationOwnerId: `${runId}_enterprise_b`,
    status: "confirmed", webhookConfirmed: true, amountCents: 9900, challengeId: `${runId}_foreign_challenge`,
  });
  const ownSponsorPaymentStatus = await paymentStatus(request(`http://localhost/api/payments/status?purpose=sponsor_contribution&reference=${sponsorContributionId}`, sponsorToken));
  assert.equal(ownSponsorPaymentStatus.status, 200, await ownSponsorPaymentStatus.clone().text());
  const ownSponsorStatusBody = await ownSponsorPaymentStatus.json();
  assert.equal(ownSponsorStatusBody.data?.amountCents, 2500, JSON.stringify(ownSponsorStatusBody));
  const crossOrganizationStatus = await paymentStatus(request(`http://localhost/api/payments/status?purpose=sponsor_contribution&reference=${foreignSponsorContributionId}`, sponsorToken));
  assert.equal(crossOrganizationStatus.status, 200, await crossOrganizationStatus.clone().text());
  assert.equal((await crossOrganizationStatus.json()).data?.amountCents, null);

  await Promise.all([
    db.collection("challenges").doc(settlementChallengeId).set({
      id: settlementChallengeId, title: "Enterprise settlement lock route", creatorId: userId,
      status: "completed", officialChallenge: true, ownershipType: "challenge_suite_official",
      organizationOwnerId: organizationId, prizeValue: 2500, confirmedCreatorPrizeFundingCents: 2500,
      confirmedPaidVoteGrossCents: 0, confirmedSponsorContributionCents: 0, confirmedPlatformPromotionalCents: 0,
    }),
    db.collection("creatorPrizeFundingPayments").doc(settlementFundingId).set({
      id: settlementFundingId, userId, challengeId: settlementChallengeId, organizationOwnerId: organizationId,
      financialOwnerType: "organization", paymentPurpose: "prize_pool_funding", status: "confirmed",
      webhookConfirmed: true, amountCents: 2500, currency: "USD", providerPaymentIntentId: `pi_${runId}_settlement`,
    }),
    db.collection("submissions").doc(settlementSubmissionId).set({
      id: settlementSubmissionId, challengeId: settlementChallengeId, userId: otherUserId,
      status: "approved", participantStatus: "approved", paymentStatus: "confirmed", weightedVoteCount: 10,
    }),
    db.collection("winnerProposals").doc(settlementProposalId).set({
      id: settlementProposalId, challengeId: settlementChallengeId, status: "approved",
      winners: [{ userId: otherUserId, submissionId: settlementSubmissionId, placement: 1, splitPercent: 100 }],
    }),
  ]);
  const { POST: approveWinners } = await import("../app/api/admin/challenges/[id]/winner-proposals/[proposalId]/approve/route.ts");
  const settlementResponse = await approveWinners(new Request(`http://localhost/api/admin/challenges/${settlementChallengeId}/winner-proposals/${settlementProposalId}/approve`, {
    method: "POST", headers: { authorization: `Bearer ${adminToken}`, "content-type": "application/json" }, body: JSON.stringify({ adminNote: "Deterministic Enterprise settlement route test" }),
  }), { params: Promise.resolve({ id: settlementChallengeId, proposalId: settlementProposalId }) });
  assert.equal(settlementResponse.status, 200, await settlementResponse.clone().text());
  const settlementId = `challenge_settlement_${settlementChallengeId}_${settlementProposalId}`;
  const preparedSettlement = (await db.collection("challengeSettlements").doc(settlementId).get()).data();
  assert.equal(preparedSettlement.enterpriseOrganizationId, organizationId);
  assert.equal(preparedSettlement.enterpriseFinanceIsolated, true);
  assert.equal(preparedSettlement.payoutProviderCalled, false);
  assert.equal((await db.collection("cashLedger").doc(`${settlementId}_challenge_winner_${otherUserId}_1`).get()).exists, true);
  assert.equal((await db.collection("enterpriseFinanceWallets").doc(organizationId).get()).exists, false);
  assert.equal((await db.collection("cashWallets").doc(userId).get()).data().availableBalanceCents, creatorWalletBeforeSponsorFunding.availableBalanceCents);
  const { POST: finalizeSettlementLedger } = await import("../app/api/admin/challenges/[id]/winner-proposals/[proposalId]/finalize-ledger/route.ts");
  const finalizeRetry = await finalizeSettlementLedger(new Request(`http://localhost/api/admin/challenges/${settlementChallengeId}/winner-proposals/${settlementProposalId}/finalize-ledger`, {
    method: "POST", headers: { authorization: `Bearer ${adminToken}`, "content-type": "application/json" },
  }), { params: Promise.resolve({ id: settlementChallengeId, proposalId: settlementProposalId }) });
  assert.equal(finalizeRetry.status, 200, await finalizeRetry.clone().text());
  const finalizationResult = await finalizeRetry.json();
  assert.equal(finalizationResult.data?.idempotent, true);
  assert.equal((await db.collection("cashLedger").where("settlementId", "==", settlementId).get()).size, 1);
  const settlementLock = (await db.collection("enterpriseChallengeFinanceLocks").doc(settlementChallengeId).get()).data();
  assert.equal(settlementLock.status, "settlement_prepared");
  const callsBeforeSettlementRefundAttempt = providerRefundCalls;
  await db.collection("refundCases").doc(settlementRefundCaseId).set({
    id: settlementRefundCaseId, paymentCollection: "creatorPrizeFundingPayments", paymentId: settlementFundingId,
    organizationOwnerId: organizationId, challengeId: settlementChallengeId, financialOwnerType: "organization",
    amountCents: 2500, currency: "USD", providerPaymentIntentId: `pi_${runId}_settlement`,
    status: "approved", reason: "Settled funding cannot be refunded", createdAt: new Date().toISOString(),
  });
  const settledRefundResponse = await updateRefundCase(new Request("http://localhost/api/admin/refunds", {
    method: "PATCH", headers: { authorization: `Bearer ${adminToken}`, "content-type": "application/json" },
    body: JSON.stringify({ refundCaseId: settlementRefundCaseId, action: "execute", reason: "Attempt refund after settlement" }),
  }));
  assert.equal(settledRefundResponse.status, 409, await settledRefundResponse.clone().text());
  assert.equal(providerRefundCalls, callsBeforeSettlementRefundAttempt);
  assert.equal((await db.collection("creatorPrizeFundingPayments").doc(settlementFundingId).get()).data().status, "confirmed");

  const sponsorRefundCaseId = await executeAdminRefund("sponsorContributions", sponsorContributionId, "Sponsor prize funding", { failOnce: true });
  assert.equal((await db.collection("sponsorContributions").doc(sponsorContributionId).get()).data().status, "refunded");
  assert.equal((await db.collection("sponsorChallengeAgreements").doc(sponsorAgreementId).get()).data().fundingStatus, "refunded", "source-linked Sponsor refund updates the accepted agreement lifecycle");
  assert.equal((await db.collection("sponsorships").doc(`sponsorship_agreement_${sponsorAgreementId}`).get()).data().status, "refunded", "refunded commercial sponsorship is no longer presented as funded");
  assert.equal((await db.collection("enterprisePrizeFundingLimits").doc(sponsorChallengeId).get()).data().exposureCents, 0);
  assert.equal((await db.collection("refundCases").doc(sponsorRefundCaseId).get()).data().organizationOwnerId, organizationId);

  await db.collection("challenges").doc(participantChallengeId).set({
    id: participantChallengeId, title: "Emulator paid entry", creatorId: userId, status: "registration_open", publishedAt: new Date().toISOString(),
    registrationOpensAt: new Date(Date.now() - 60 * 60 * 1000).toISOString(), registrationClosesAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
    challengeStartsAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(), challengeEndsAt: new Date(Date.now() + 48 * 60 * 60 * 1000).toISOString(),
    paidEntryEnabled: true, entryFeeAmountCents: 2000, officialChallenge: true, ownershipType: "challenge_suite_official",
    organizationOwnerId: organizationId, category: "art", region: "US", prizeValue: 0, maxParticipants: 100,
  });
  const creatorWalletBeforeEntry = (await db.collection("cashWallets").doc(userId).get()).data();
  const { POST: createEntryCheckout } = await import("../app/api/challenges/[id]/entry-checkout/route.ts");
  const entryCheckout = await createEntryCheckout(new Request("http://localhost/api/challenges/test/entry-checkout", {
    method: "POST", headers: { authorization: `Bearer ${participantToken}`, "content-type": "application/json" },
    body: JSON.stringify({ entryAgreementAccepted: true }),
  }), { params: Promise.resolve({ id: participantChallengeId }) });
  assert.equal(entryCheckout.status, 200, await entryCheckout.clone().text());
  const entryCheckoutBody = await entryCheckout.json();
  entryPaymentId = entryCheckoutBody.data?.entryPaymentId ?? entryCheckoutBody.entryPaymentId;
  const pendingEntry = (await db.collection("challengeEntryPayments").doc(entryPaymentId).get()).data();
  assert.equal(pendingEntry.status, "pending");
  assert.equal(pendingEntry.organizationOwnerId, organizationId);
  assert.equal(pendingEntry.winnerShareCents, 1300);
  assert.equal(pendingEntry.creatorHostOperatorShareCents, 400);
  assert.equal(pendingEntry.platformFeeCents, 300);
  const [entryWebhook, entryReturn] = await Promise.all([
    sendWebhook(stripeEvent(`${runId}_entry_event`, createdEntrySession)),
    verifyCheckout(request(`http://localhost/api/verify-checkout?session_id=${participantSessionId}`, participantToken)),
  ]);
  assert.equal(entryWebhook.status, 200, await entryWebhook.clone().text());
  assert.equal(entryReturn.status, 200, await entryReturn.clone().text());
  const entryRetryWebhook = await sendWebhook(stripeEvent(`${runId}_entry_retry_event`, createdEntrySession));
  assert.equal(entryRetryWebhook.status, 200, await entryRetryWebhook.clone().text());
  const confirmedEntry = (await db.collection("challengeEntryPayments").doc(entryPaymentId).get()).data();
  const entryExposure = (await db.collection("enterprisePrizeFundingLimits").doc(participantChallengeId).get()).data();
  const entryLedgers = await db.collection("challengeFinancialLedger").where("entryPaymentId", "==", entryPaymentId).get();
  entryLedgerRefs = entryLedgers.docs.map((doc) => doc.ref);
  assert.equal(confirmedEntry.status, "paid");
  assert.equal(confirmedEntry.organizationOwnerId, organizationId);
  assert.equal(confirmedEntry.winnerShareCents, 1300);
  assert.equal(entryExposure.exposureCents, 1300);
  assert.equal(entryLedgers.size, 3);
  assert.equal(entryLedgers.docs.every((doc) => doc.data().organizationOwnerId === organizationId), true);
  assert.equal(entryLedgers.docs.find((doc) => doc.data().shareType === "creator_host_share").data().amountCents, 400);
  assert.equal(entryLedgers.docs.find((doc) => doc.data().shareType === "platform_share").data().amountCents, 300);
  assert.deepEqual((await db.collection("cashWallets").doc(userId).get()).data(), creatorWalletBeforeEntry);
  await Promise.all([
    db.collection("challengeEntryRequests").doc(paidEntryRequestId).set({ id: paidEntryRequestId, challengeId: participantChallengeId, userId: participantUserId, status: "approved", entryPaymentId, createdAt: new Date().toISOString() }),
    db.collection("challengeParticipants").doc(paidEntryRequestId).set({ id: paidEntryRequestId, challengeId: participantChallengeId, userId: participantUserId, entryPaymentStatus: "paid", entryPaymentId, status: "approved" }),
  ]);
  const { POST: rejectPaidEntryRequest } = await import("../app/api/challenges/[id]/entry-request/[requestId]/reject/route.ts");
  const rejectPaidEntry = await rejectPaidEntryRequest(new Request(`http://localhost/api/challenges/${participantChallengeId}/entry-request/${paidEntryRequestId}/reject`, {
    method: "POST", headers: { authorization: `Bearer ${ownerToken}`, "content-type": "application/json" }, body: JSON.stringify({ reason: "Enterprise owner rejects a confirmed paid entry" }),
  }), { params: Promise.resolve({ id: participantChallengeId, requestId: paidEntryRequestId }) });
  assert.equal(rejectPaidEntry.status, 200, await rejectPaidEntry.clone().text());
  assert.equal((await db.collection("challengeParticipants").doc(paidEntryRequestId).get()).data().refundStatus, "refund_review");
  const rejectedPaidEntryPayment = (await db.collection("challengeEntryPayments").doc(entryPaymentId).get()).data();
  assert.equal(rejectedPaidEntryPayment.status, "paid");
  assert.equal(rejectedPaidEntryPayment.refundStatus, "refund_review");
  assert.equal(rejectedPaidEntryPayment.refundExecutionEnabled, false);
  const entryRefundCaseId = await executeAdminRefund("challengeEntryPayments", entryPaymentId, "paid-entry allocation");
  assert.equal((await db.collection("challengeEntryPayments").doc(entryPaymentId).get()).data().status, "refunded");
  assert.equal((await db.collection("enterprisePrizeFundingLimits").doc(participantChallengeId).get()).data().exposureCents, 0);
  assert.equal((await db.collection("refundCases").doc(entryRefundCaseId).get()).data().organizationOwnerId, organizationId);
  console.log("PASS actual creator, Sponsor, paid-entry, Admin promo/refund/operations handlers plus settlement/refund-lock and Stripe webhook routes: Enterprise ownership, 65/20/15 allocation, idempotency, provider refund retry suppression, audit, verified return purpose, and no creator personal-wallet credit");
} finally {
  await Promise.all([
    db.collection("paidVotePurchases").doc(purchaseId).delete(),
    db.collection("challenges").doc(challengeId).delete(),
    db.collection("challenges").doc(sponsorChallengeId).delete(),
    db.collection("challenges").doc(participantChallengeId).delete(),
    db.collection("enterprisePrizeFundingLimits").doc(challengeId).delete(),
    db.collection("enterprisePrizeFundingLimits").doc(sponsorChallengeId).delete(),
    db.collection("enterprisePrizeFundingLimits").doc(participantChallengeId).delete(),
    ...creatorLedgerRefs.map((ref) => ref.delete()),
    ...sponsorLedgerRefs.map((ref) => ref.delete()),
    ...entryLedgerRefs.map((ref) => ref.delete()),
    ...(fundingId ? [db.collection("creatorPrizeFundingPayments").doc(fundingId).delete()] : []),
    ...(sponsorContributionId ? [db.collection("sponsorContributions").doc(sponsorContributionId).delete()] : []),
    db.collection("sponsorChallengeAgreements").doc(`sponsor_opportunity_${sponsorChallengeId}_${sponsorOrgId}`).delete(),
    db.collection("sponsorships").doc(`sponsorship_agreement_sponsor_opportunity_${sponsorChallengeId}_${sponsorOrgId}`).delete(),
    db.collection("sponsorContributions").doc(foreignSponsorContributionId).delete(),
    ...(entryPaymentId ? [db.collection("challengeEntryPayments").doc(entryPaymentId).delete(), db.collection("challengeParticipants").doc(`${participantChallengeId}_${participantUserId}`).delete()] : []),
    db.collection("challengeEntryRequests").doc(paidEntryRequestId).delete(),
    db.collection("challengeParticipants").doc(paidEntryRequestId).delete(),
    db.collection("sponsorProfiles").doc(sponsorOrgId).delete(),
    db.collection("sponsorMemberships").doc(`${runId}_sponsor_membership`).delete(),
    ...(sponsorUserId ? [db.collection("users").doc(sponsorUserId).delete(), db.collection("profiles").doc(sponsorUserId).delete()] : []),
    ...(participantUserId ? [db.collection("users").doc(participantUserId).delete()] : []),
    ...(adminUserId ? [db.collection("users").doc(adminUserId).delete()] : []),
    db.collection("withdrawalRequests").doc(withdrawalId).delete(),
    db.collection("cashWallets").doc(userId).delete(),
    db.collection("cashLedger").doc(`${withdrawalId}_rejected`).delete(),
    db.collection("paidVotePurchases").doc(paidVoteRefundId).delete(),
    db.collection("paidVoteCredits").doc(paidVoteCreditId).delete(),
    db.collection("challengeFinancialLedger").doc(paidVoteLedgerId).delete(),
    db.collection("challengeSettlements").doc(`challenge_settlement_${settlementChallengeId}_${settlementProposalId}`).delete(),
    db.collection("cashLedger").doc(`challenge_settlement_${settlementChallengeId}_${settlementProposalId}_challenge_winner_${otherUserId}_1`).delete(),
    db.collection("cashWallets").doc(otherUserId).delete(),
    db.collection("auditLogs").doc(`challenge_settlement_${settlementChallengeId}_${settlementProposalId}_audit`).delete(),
    db.collection("winnerProposals").doc(settlementProposalId).delete(),
    db.collection("submissions").doc(settlementSubmissionId).delete(),
    db.collection("challenges").doc(settlementChallengeId).delete(),
    db.collection("creatorPrizeFundingPayments").doc(settlementFundingId).delete(),
    db.collection("enterpriseChallengeFinanceLocks").doc(settlementChallengeId).delete(),
    db.collection("enterprisePrizeFundingLimits").doc(settlementChallengeId).delete(),
    db.collection("refundCases").doc(settlementRefundCaseId).delete(),
    db.collection("refundCases").doc(`refund_paidVotePurchases_${paidVoteRefundId}`).delete(),
    db.collection("challengeFinancialLedger").doc(`enterprise_refund_refund_paidVotePurchases_${paidVoteRefundId}`).delete(),
    db.collection("cashLedger").doc(`refund_refund_paidVotePurchases_${paidVoteRefundId}`).delete(),
    ...(promotionalFundingId ? [db.collection("enterprisePromotionalPrizeFunding").doc(promotionalFundingId).delete()] : []),
    ...(refundCaseId ? [db.collection("refundCases").doc(refundCaseId).delete(), db.collection("challengeFinancialLedger").doc(`enterprise_refund_${refundCaseId}`).delete(), db.collection("cashLedger").doc(`refund_${refundCaseId}`).delete()] : []),
    ...(sponsorContributionId ? [db.collection("refundCases").doc(`refund_sponsorContributions_${sponsorContributionId}`).delete(), db.collection("challengeFinancialLedger").doc(`enterprise_refund_refund_sponsorContributions_${sponsorContributionId}`).delete(), db.collection("cashLedger").doc(`refund_refund_sponsorContributions_${sponsorContributionId}`).delete()] : []),
    ...(entryPaymentId ? [db.collection("refundCases").doc(`refund_challengeEntryPayments_${entryPaymentId}`).delete(), db.collection("challengeFinancialLedger").doc(`enterprise_refund_refund_challengeEntryPayments_${entryPaymentId}`).delete(), db.collection("cashLedger").doc(`refund_refund_challengeEntryPayments_${entryPaymentId}`).delete()] : []),
    db.collection("stripeWebhookEvents").doc(`${runId}_refund_updated_event`).delete(),
    db.collection("stripeWebhookEvents").doc(`${runId}_refund_updated_retry_event`).delete(),
    db.collection("stripeWebhookEvents").doc(`${runId}_creator_event`).delete(),
    db.collection("stripeWebhookEvents").doc(`${runId}_creator_retry_event`).delete(),
    db.collection("stripeWebhookEvents").doc(`${runId}_sponsor_event`).delete(),
    db.collection("stripeWebhookEvents").doc(`${runId}_sponsor_retry_event`).delete(),
    db.collection("stripeWebhookEvents").doc(`${runId}_entry_event`).delete(),
    db.collection("stripeWebhookEvents").doc(`${runId}_entry_retry_event`).delete(),
    db.collection("users").doc(userId).delete(), db.collection("users").doc(otherUserId).delete(),
  ]);
  setStripeClientForTests(null);
  await app.delete();
}
