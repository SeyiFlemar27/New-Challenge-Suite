import assert from "node:assert/strict";
import Stripe from "stripe";
import { initializeApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";

assert.ok(process.env.FIRESTORE_EMULATOR_HOST, "FIRESTORE_EMULATOR_HOST is required");
assert.ok(process.env.STRIPE_WEBHOOK_SECRET, "STRIPE_WEBHOOK_SECRET is required");
const app = initializeApp({ projectId: process.env.FIREBASE_PROJECT_ID ?? "demo-challenge-suite" });
const db = getFirestore(app);
const runId = `webhook_route_${Date.now()}_${Math.random().toString(36).slice(2)}`;
const challengeId = `${runId}_challenge`;
const purchaseId = `${runId}_purchase`;
const org = `${runId}_org`;
const paymentIntentId = `${runId}_pi`;
const sessionId = `${runId}_session`;
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
const { POST } = await import("../app/api/stripe/webhook/route.ts");

async function send(event) {
  const payload = JSON.stringify(event);
  const signature = stripe.webhooks.generateTestHeaderString({ payload, secret: process.env.STRIPE_WEBHOOK_SECRET });
  return POST(new Request("http://localhost/api/stripe/webhook", {
    method: "POST",
    headers: { "content-type": "application/json", "stripe-signature": signature },
    body: payload,
  }));
}

try {
  await db.collection("challenges").doc(challengeId).set({ organizationOwnerId: org, officialChallenge: true, status: "active" });
  await db.collection("paidVotePurchases").doc(purchaseId).set({
    id: purchaseId,
    userId: `${runId}_voter`,
    challengeId,
    organizationOwnerId: org,
    financialOwnerType: "organization",
    amountCents: 1000,
    currency: "USD",
    voteQuantity: 2,
    paymentPurpose: "paid_vote",
    status: "pending",
  });
  const session = {
    id: sessionId,
    object: "checkout.session",
    mode: "payment",
    payment_status: "paid",
    status: "complete",
    amount_total: 1000,
    currency: "usd",
    payment_intent: paymentIntentId,
    metadata: { paymentPurpose: "paid_vote", votePurchaseId: purchaseId },
  };
  const event = (id) => ({
    id,
    object: "event",
    api_version: "2025-02-24.acacia",
    created: Math.floor(Date.now() / 1000),
    livemode: false,
    pending_webhooks: 1,
    request: null,
    type: "checkout.session.completed",
    data: { object: session, previous_attributes: null },
  });

  const first = await send(event(`${runId}_event`));
  assert.equal(first.status, 200, await first.clone().text());
  const duplicateEvent = await send(event(`${runId}_event`));
  assert.equal(duplicateEvent.status, 200);
  const retryEvent = await send(event(`${runId}_retry_event`));
  assert.equal(retryEvent.status, 200);
  const purchase = (await db.collection("paidVotePurchases").doc(purchaseId).get()).data();
  const challenge = (await db.collection("challenges").doc(challengeId).get()).data();
  const credits = await db.collection("paidVoteCredits").where("purchaseId", "==", purchaseId).get();
  const ledgers = await db.collection("challengeFinancialLedger").where("paidVotePurchaseId", "==", purchaseId).get();
  assert.equal(purchase?.status, "confirmed");
  assert.equal(purchase?.organizationOwnerId, org);
  assert.equal(challenge?.confirmedPaidVotePurchaseCount, 1);
  assert.equal(credits.size, 1);
  assert.equal(ledgers.size, 3);
  assert.equal(ledgers.docs.every((doc) => doc.data().organizationOwnerId === org), true);
  assert.equal((await db.collection("cashWallets").doc(purchase.userId).get()).exists, false);
  console.log("PASS actual Stripe webhook route + Firestore Emulator: signature verification, duplicate event, distinct-event retry, one paid-vote credit, organization ledgers, and no personal cash-wallet credit");
} finally {
  const ledgers = await db.collection("challengeFinancialLedger").where("paidVotePurchaseId", "==", purchaseId).get();
  const credits = await db.collection("paidVoteCredits").where("purchaseId", "==", purchaseId).get();
  await Promise.all([
    ...ledgers.docs.map((doc) => doc.ref.delete()),
    ...credits.docs.map((doc) => doc.ref.delete()),
    db.collection("challenges").doc(challengeId).delete(),
    db.collection("paidVotePurchases").doc(purchaseId).delete(),
    db.collection("stripeWebhookEvents").doc(`${runId}_event`).delete(),
    db.collection("stripeWebhookEvents").doc(`${runId}_retry_event`).delete(),
  ]);
  await app.delete();
}
