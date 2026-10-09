import assert from "node:assert/strict";
import { initializeApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import { createPendingCreatorPrizeFunding, confirmCreatorPrizeFunding, releasePendingCreatorPrizeFunding } from "../lib/server/prize-funding.ts";
import { createPendingSponsorContribution, confirmSponsorContribution, createPendingEntryPayment, confirmChallengeEntryPayment } from "../lib/server/monetization-payments.ts";

assert.ok(process.env.FIRESTORE_EMULATOR_HOST, "FIRESTORE_EMULATOR_HOST is required");
const app = initializeApp({ projectId: process.env.GCLOUD_PROJECT ?? "demo-challenge-suite" }, `enterprise-prize-lifecycle-${Date.now()}`);
const db = getFirestore(app);
const runId = `prize_lifecycle_${Date.now()}_${Math.random().toString(36).slice(2)}`;
const org = `${runId}_org`;
const now = new Date().toISOString();
const stripeSession = (metadata, amountCents) => ({
  id: `${runId}_session_${Math.random().toString(36).slice(2)}`,
  mode: "payment",
  payment_status: "paid",
  currency: "usd",
  amount_total: amountCents,
  payment_intent: `${runId}_pi_${Math.random().toString(36).slice(2)}`,
  metadata,
});

try {
  const creatorChallengeId = `${runId}_creator`;
  const creatorChallenge = { officialChallenge: true, organizationOwnerId: org, creatorId: "actor_1", prizeValue: 0, status: "active" };
  await db.collection("challenges").doc(creatorChallengeId).set(creatorChallenge);
  const creatorPayment = await createPendingCreatorPrizeFunding(db, { challengeId: creatorChallengeId, creatorId: "actor_1", organizationOwnerId: org, amountCents: 500000, now });
  let limit = (await db.collection("enterprisePrizeFundingLimits").doc(creatorChallengeId).get()).data();
  assert.equal(limit.exposureCents, 500000, "configured $5,000 and its pending creator funding are one obligation");
  assert.equal(limit.creatorReservedCents, 500000);
  const creatorSession = stripeSession({ paymentPurpose: "prize_pool_funding", creatorPrizeFundingId: creatorPayment.id, challengeId: creatorChallengeId, userId: "actor_1", initiatedByUserId: "actor_1", organizationOwnerId: org }, 500000);
  const creatorEvent = { id: `${runId}_creator_event`, type: "checkout.session.completed" };
  await confirmCreatorPrizeFunding(db, creatorEvent, creatorSession);
  const duplicateCreator = await confirmCreatorPrizeFunding(db, { ...creatorEvent, id: `${creatorEvent.id}_duplicate` }, creatorSession);
  limit = (await db.collection("enterprisePrizeFundingLimits").doc(creatorChallengeId).get()).data();
  assert.equal(duplicateCreator.duplicate, true);
  assert.equal(limit.exposureCents, 500000, "creator reservation-to-confirmation transition does not double-count");
  assert.equal(limit.creatorReservedCents, 0);
  assert.equal(limit.creatorConfirmedCents, 500000);

  const failedChallengeId = `${runId}_failed`;
  await db.collection("challenges").doc(failedChallengeId).set({ ...creatorChallenge, prizeValue: 0 });
  const failedPayment = await createPendingCreatorPrizeFunding(db, { challengeId: failedChallengeId, creatorId: "actor_2", organizationOwnerId: org, amountCents: 500000, now });
  await releasePendingCreatorPrizeFunding(db, failedPayment.id, "checkout_creation_failed");
  limit = (await db.collection("enterprisePrizeFundingLimits").doc(failedChallengeId).get()).data();
  assert.equal(limit.creatorReservedCents, 0, "failed creator funding releases its reservation");
  assert.equal(limit.exposureCents, 500000, "the configured prize obligation remains, without a duplicate reservation");

  const sponsorChallengeId = `${runId}_sponsor`;
  const sponsorChallenge = { ...creatorChallenge, prizeValue: 5000, sponsorEnabled: true };
  await db.collection("challenges").doc(sponsorChallengeId).set(sponsorChallenge);
  const sponsorPayment = await createPendingSponsorContribution(db, { sponsorId: "sponsor_1", challengeId: sponsorChallengeId, challenge: sponsorChallenge, sponsorProfile: {}, amountCents: 100000, idempotencyKey: `${runId}_sponsor_key`, now });
  limit = (await db.collection("enterprisePrizeFundingLimits").doc(sponsorChallengeId).get()).data();
  assert.equal(limit.exposureCents, 600000, "pending Sponsor contribution adds to the configured $5,000 obligation");
  const sponsorSession = stripeSession({ paymentPurpose: "sponsor_funding", sponsorContributionId: sponsorPayment.id }, 100000);
  await confirmSponsorContribution(db, { id: `${runId}_sponsor_event`, type: "checkout.session.completed" }, sponsorSession);
  const duplicateSponsor = await confirmSponsorContribution(db, { id: `${runId}_sponsor_event_dup`, type: "checkout.session.completed" }, sponsorSession);
  limit = (await db.collection("enterprisePrizeFundingLimits").doc(sponsorChallengeId).get()).data();
  assert.equal(duplicateSponsor.duplicate, true);
  assert.equal(limit.exposureCents, 600000, "Sponsor reservation-to-confirmation transition is counted once");
  assert.equal(limit.additionalReservedCents, 0);
  assert.equal(limit.sponsorConfirmedCents, 100000);

  const entryChallengeId = `${runId}_entry`;
  const entryChallenge = { ...creatorChallenge, prizeValue: 5000, paidEntryEnabled: true, entryFeeCents: 10000, maxParticipants: 10 };
  await db.collection("challenges").doc(entryChallengeId).set(entryChallenge);
  const entryPayment = await createPendingEntryPayment(db, { userId: "entrant_1", challengeId: entryChallengeId, challenge: entryChallenge, now });
  assert.equal(entryPayment.winnerShareCents, 6500, "only the canonical 65% winner share is allocated to the prize pool");
  limit = (await db.collection("enterprisePrizeFundingLimits").doc(entryChallengeId).get()).data();
  assert.equal(limit.exposureCents, 506500, "only the paid-entry winner allocation is reserved against the cap");
  const entrySession = stripeSession({ paymentPurpose: "challenge_entry_fee", entryPaymentId: entryPayment.id }, 10000);
  await confirmChallengeEntryPayment(db, { id: `${runId}_entry_event`, type: "checkout.session.completed" }, entrySession);
  limit = (await db.collection("enterprisePrizeFundingLimits").doc(entryChallengeId).get()).data();
  assert.equal(limit.exposureCents, 506500, "paid-entry reservation converts to confirmed winner allocation once");
  assert.equal(limit.entryConfirmedCents, 6500);
  assert.equal(limit.additionalReservedCents, 0);

  const entryCapChallengeId = `${runId}_entry_cap`;
  const entryCapChallenge = { ...entryChallenge, prizeValue: 9950, entryFeeCents: 10000 };
  await db.collection("challenges").doc(entryCapChallengeId).set(entryCapChallenge);
  await assert.rejects(
    () => createPendingEntryPayment(db, { userId: "entrant_cap", challengeId: entryCapChallengeId, challenge: entryCapChallenge, now }),
    /ENTERPRISE_PRIZE_LIMIT_EXCEEDED/,
    "paid-entry checkout is rejected before accepting a payment whose 65% winner allocation breaches the cap",
  );
  assert.equal((await db.collection("challengeEntryPayments").where("challengeId", "==", entryCapChallengeId).get()).empty, true);
  console.log("PASS Firestore Emulator prize-pool lifecycle: configured/creator same obligation, pending-to-confirmed/released transitions, additive Sponsor funding, paid-entry 65% allocation, and duplicate confirmations");
} finally {
  await app.delete();
}
