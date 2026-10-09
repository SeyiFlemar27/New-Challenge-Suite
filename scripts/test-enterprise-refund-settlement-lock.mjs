import assert from "node:assert/strict";
import { initializeApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import {
  claimEnterpriseRefundLock,
  finalizeEnterprisePaidVoteRefund,
  finalizeEnterprisePrizeFundingRefund,
  releaseEnterpriseRefundLock,
  reserveEnterpriseSettlementLockInTransaction,
} from "../lib/server/enterprise-prize-exposure.ts";

assert.ok(process.env.FIRESTORE_EMULATOR_HOST, "FIRESTORE_EMULATOR_HOST is required");
const app = initializeApp({ projectId: process.env.GCLOUD_PROJECT ?? "demo-challenge-suite" }, `enterprise-refund-settlement-${Date.now()}`);
const db = getFirestore(app);
const runId = `refund_settlement_${Date.now()}_${Math.random().toString(36).slice(2)}`;
const org = `${runId}_org`;
const now = new Date().toISOString();
const fixtures = [];
const refundIds = [];
const paymentIds = [];
const paidVoteIds = [];

async function seed(challengeId, refundCaseId, paymentId) {
  fixtures.push(challengeId);
  refundIds.push(refundCaseId);
  paymentIds.push(paymentId);
  await Promise.all([
    db.collection("challenges").doc(challengeId).set({ officialChallenge: true, organizationOwnerId: org, prizeValue: 0, confirmedSponsorContributionCents: 100000 }),
    db.collection("sponsorContributions").doc(paymentId).set({ challengeId, organizationOwnerId: org, amountCents: 100000, status: "confirmed", paymentStatus: "confirmed" }),
    db.collection("refundCases").doc(refundCaseId).set({ paymentCollection: "sponsorContributions", paymentId, amountCents: 100000, status: "approved" }),
    db.collection("enterprisePrizeFundingLimits").doc(challengeId).set({ challengeId, organizationOwnerId: org, configuredPrizeCents: 0, confirmedCents: 100000, reservedCents: 0, exposureCents: 100000, maximumCents: 1000000 }),
    db.collection("prizePools").doc(challengeId).set({ confirmedSponsorContributionCents: 100000, totalConfirmedCents: 100000, totalCommittedCents: 100000, visibleJackpotCents: 100000 }),
  ]);
}

try {
  const raceChallenge = `${runId}_race`;
  const raceRefund = `${runId}_race_refund`;
  const racePayment = `${runId}_race_payment`;
  await seed(raceChallenge, raceRefund, racePayment);
  const race = await Promise.allSettled([
    claimEnterpriseRefundLock(db, { refundCaseId: raceRefund, paymentCollection: "sponsorContributions", paymentId: racePayment, now }),
    db.runTransaction((transaction) => reserveEnterpriseSettlementLockInTransaction(db, transaction, { challengeId: raceChallenge, organizationOwnerId: org, settlementId: `${runId}_settlement`, now })),
  ]);
  assert.equal(race.filter((item) => item.status === "fulfilled").length, 1, "refund claim and settlement lock contend on one Firestore document");
  assert.equal(race.filter((item) => item.status === "rejected").length, 1);
  const raceLock = (await db.collection("enterpriseChallengeFinanceLocks").doc(raceChallenge).get()).data();
  if (raceLock?.status === "refund_pending") {
    await assert.rejects(() => db.runTransaction((transaction) => reserveEnterpriseSettlementLockInTransaction(db, transaction, { challengeId: raceChallenge, organizationOwnerId: org, settlementId: `${runId}_later_settlement`, now })), /ENTERPRISE_REFUND_PENDING/);
    await releaseEnterpriseRefundLock(db, { refundCaseId: raceRefund, challengeId: raceChallenge, refundStatus: "approved", providerStatus: "test_provider_failure", now });
    await db.runTransaction((transaction) => reserveEnterpriseSettlementLockInTransaction(db, transaction, { challengeId: raceChallenge, organizationOwnerId: org, settlementId: `${runId}_retry_settlement`, now }));
  } else {
    await assert.rejects(() => claimEnterpriseRefundLock(db, { refundCaseId: raceRefund, paymentCollection: "sponsorContributions", paymentId: racePayment, now }), /ENTERPRISE_REFUND_SETTLEMENT_LOCKED/);
  }

  const refundChallenge = `${runId}_refund`;
  const refundCaseId = `${runId}_refund_case`;
  const paymentId = `${runId}_refund_payment`;
  await seed(refundChallenge, refundCaseId, paymentId);
  await claimEnterpriseRefundLock(db, { refundCaseId, paymentCollection: "sponsorContributions", paymentId, now });
  await db.collection("refundCases").doc(refundCaseId).set({ status: "processing" }, { merge: true });
  const result = await finalizeEnterprisePrizeFundingRefund(db, { refundCaseId, paymentCollection: "sponsorContributions", paymentId, providerRefundId: `${runId}_provider_refund`, now });
  assert.equal(result.idempotent, false);
  const duplicate = await finalizeEnterprisePrizeFundingRefund(db, { refundCaseId, paymentCollection: "sponsorContributions", paymentId, providerRefundId: `${runId}_provider_refund`, now });
  assert.equal(duplicate.idempotent, true, "duplicate refund webhook is idempotent");
  assert.equal((await db.collection("enterprisePrizeFundingLimits").doc(refundChallenge).get()).data()?.confirmedCents, 0);
  assert.equal((await db.collection("enterpriseChallengeFinanceLocks").doc(refundChallenge).get()).data()?.status, "open");
  assert.equal((await db.collection("challengeFinancialLedger").doc(`enterprise_refund_${refundCaseId}`).get()).exists, true);
  assert.equal((await db.collection("cashLedger").doc(`refund_${refundCaseId}`).get()).exists, true, "provider-refund cash ledger is written by the same idempotent transaction");
  await db.runTransaction((transaction) => reserveEnterpriseSettlementLockInTransaction(db, transaction, { challengeId: refundChallenge, organizationOwnerId: org, settlementId: `${runId}_after_refund_settlement`, now }));
  await db.runTransaction((transaction) => reserveEnterpriseSettlementLockInTransaction(db, transaction, { challengeId: refundChallenge, organizationOwnerId: org, settlementId: `${runId}_after_refund_settlement`, now }));
  await assert.rejects(() => claimEnterpriseRefundLock(db, { refundCaseId, paymentCollection: "sponsorContributions", paymentId, now }), /ENTERPRISE_REFUND_/);

  const paidVoteChallenge = `${runId}_paid_vote_challenge`;
  const paidVoteId = `${runId}_paid_vote`;
  const paidVoteRefundId = `${runId}_paid_vote_refund`;
  fixtures.push(paidVoteChallenge);
  paidVoteIds.push(paidVoteId);
  const paidVoteCreditId = `${paidVoteId}_credit`;
  await Promise.all([
    db.collection("challenges").doc(paidVoteChallenge).set({ organizationOwnerId: org, confirmedPaidVoteGrossCents: 1000, confirmedPaidVoteWinnerShareCents: 650, confirmedPaidVoteCreatorHostOperatorShareCents: 200, confirmedPaidVotePlatformAdminShareCents: 150 }),
    db.collection("paidVotePurchases").doc(paidVoteId).set({ id: paidVoteId, challengeId: paidVoteChallenge, organizationOwnerId: org, amountCents: 1000, winnerShareCents: 650, creatorHostOperatorShareCents: 200, platformFeeCents: 150, currency: "USD", status: "confirmed" }),
    db.collection("refundCases").doc(paidVoteRefundId).set({ id: paidVoteRefundId, paymentCollection: "paidVotePurchases", paymentId: paidVoteId, amountCents: 1000, status: "approved" }),
    db.collection("challengeFinancialLedger").doc(`${paidVoteId}_winner`).set({ paidVotePurchaseId: paidVoteId, organizationOwnerId: org, shareType: "winner_share", amountCents: 650, status: "confirmed" }),
    db.collection("paidVoteCredits").doc(paidVoteCreditId).set({ purchaseId: paidVoteId, voteQuantity: 5, votesGranted: 5, votesRemaining: 5, status: "available" }),
  ]);
  await claimEnterpriseRefundLock(db, { refundCaseId: paidVoteRefundId, paymentCollection: "paidVotePurchases", paymentId: paidVoteId, now });
  await assert.rejects(() => db.runTransaction((transaction) => reserveEnterpriseSettlementLockInTransaction(db, transaction, { challengeId: paidVoteChallenge, organizationOwnerId: org, settlementId: `${runId}_paid_vote_settlement`, now })), /ENTERPRISE_REFUND_PENDING/);
  const paidVoteRefund = await finalizeEnterprisePaidVoteRefund(db, { refundCaseId: paidVoteRefundId, paymentId: paidVoteId, providerRefundId: `${runId}_paid_vote_provider_refund`, now });
  assert.equal(paidVoteRefund.idempotent, false);
  assert.equal((await finalizeEnterprisePaidVoteRefund(db, { refundCaseId: paidVoteRefundId, paymentId: paidVoteId, providerRefundId: `${runId}_paid_vote_provider_refund`, now })).idempotent, true);
  const paidVoteChallengeAfterRefund = (await db.collection("challenges").doc(paidVoteChallenge).get()).data();
  assert.equal(paidVoteChallengeAfterRefund?.confirmedPaidVoteGrossCents, 0);
  assert.equal((await db.collection("enterprisePrizeFundingLimits").doc(paidVoteChallenge).get()).exists, false, "paid-vote revenue refund never creates or changes prize-pool cap exposure");
  assert.equal((await db.collection("challengeFinancialLedger").doc(`${paidVoteId}_winner`).get()).data()?.status, "refunded");
  const refundedCredit = (await db.collection("paidVoteCredits").doc(paidVoteCreditId).get()).data();
  assert.equal(refundedCredit?.status, "refunded");
  assert.equal(refundedCredit?.votesRemaining, 0);
  assert.equal((await db.collection("cashLedger").doc(`refund_${paidVoteRefundId}`).get()).data()?.organizationOwnerId, org);
  console.log("PASS Firestore Emulator Enterprise refund/settlement lock: concurrent exclusion, pending-refund settlement denial, retry after failed refund, duplicate refund idempotency, and exposure reversal");
} finally {
  for (const challengeId of fixtures) {
    await Promise.all([
      db.collection("challenges").doc(challengeId).delete(),
      db.collection("enterprisePrizeFundingLimits").doc(challengeId).delete(),
      db.collection("prizePools").doc(challengeId).delete(),
      db.collection("enterpriseChallengeFinanceLocks").doc(challengeId).delete(),
    ]);
  }
  await Promise.all([
    ...refundIds.map((id) => db.collection("refundCases").doc(id).delete()),
    ...paymentIds.map((id) => db.collection("sponsorContributions").doc(id).delete()),
    ...refundIds.map((id) => db.collection("challengeFinancialLedger").doc(`enterprise_refund_${id}`).delete()),
    ...refundIds.map((id) => db.collection("cashLedger").doc(`refund_${id}`).delete()),
    ...paidVoteIds.map((id) => db.collection("paidVotePurchases").doc(id).delete()),
    ...paidVoteIds.map((id) => db.collection("paidVoteCredits").doc(`${id}_credit`).delete()),
    ...paidVoteIds.map((id) => db.collection("challengeFinancialLedger").doc(`${id}_winner`).delete()),
    ...paidVoteIds.map((id) => db.collection("cashLedger").doc(`refund_${runId}_paid_vote_refund`).delete()),
    db.collection("refundCases").doc(`${runId}_paid_vote_refund`).delete(),
  ]);
  await app.delete();
}
