import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { initializeApp, deleteApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import { createInternalChallengeSettlement, getConfirmedSettlementSources } from "../lib/server/challenge-settlement.ts";
assert.match(process.env.GCLOUD_PROJECT ?? "", /^demo-/);
assert.match(process.env.FIRESTORE_EMULATOR_HOST ?? "", /^(localhost|127\.0\.0\.1):\d+$/);
const app = initializeApp({ projectId: process.env.GCLOUD_PROJECT });
const db = getFirestore(app);
const id = `normal_settlement_${randomUUID()}`;
const payment = db.collection("creatorPrizeFundingPayments").doc(id);
const challenge = { id, builderVersion: "normal_v3", normalLifecyclePolicyVersion: 1, creatorId: `${id}_creator`, numberOfWinners: 3, status: "under_review", finalVoteSnapshotId: id };
const winners = [1, 2].map(placement => ({ userId: `${id}_user_${placement}`, submissionId: `${id}_submission_${placement}`, placement, splitPercent: placement === 1 ? 60 / 85 * 100 : 25 / 85 * 100 }));
let assertions = 0;
try {
  await db.collection("challenges").doc(id).set(challenge);
  await db.collection("winnerProposals").doc(id).set({ challengeId: id, status: "submitted", updatedAt: "fixture_revision_1" });
  await db.collection("normalLifecycleEvents").doc(id).set({ challengeId: id, candidates: winners.map(winner => ({ submissionId: winner.submissionId, userId: winner.userId, validVotes: 10 })) });
  for (const winner of winners) {
    await db.collection("submissions").doc(winner.submissionId).set({ challengeId: id, userId: winner.userId, status: "approved", moderationStatus: "approved" });
    await db.collection("challengeParticipants").doc(`${id}_${winner.userId}`).set({ challengeId: id, userId: winner.userId, status: "active" });
  }
  await payment.set({ challengeId: id, userId: challenge.creatorId, status: "confirmed", paymentPurpose: "prize_pool_funding", webhookConfirmed: true, amountCents: 10001, currency: "USD" });
  const sources = await getConfirmedSettlementSources(db, id);
  const input = { challengeId: id, proposalId: id, adminId: "fixture_admin", challenge, winners, confirmedSources: sources, proposalApproval: { update: { status: "approved", winners, reviewedByAdminId: "fixture_admin" }, expectedUpdatedAt: "fixture_revision_1" } };
  await payment.update({ settlementRestricted: true });
  await assert.rejects(createInternalChallengeSettlement(db, input), /NORMAL_SETTLEMENT_FUNDING_CHANGED/); assertions++;
  assert.equal((await db.collection("cashLedger").where("challengeId", "==", id).get()).size, 0); assertions++;
  assert.equal((await db.collection("winnerProposals").doc(id).get()).data().status, "submitted"); assertions++;
  await payment.update({ settlementRestricted: false });
  await payment.update({ amountCents: 10001.5 });
  await assert.rejects(createInternalChallengeSettlement(db, { ...input, confirmedSources: await getConfirmedSettlementSources(db, id) }), /NORMAL_SETTLEMENT_FUNDING_CHANGED/); assertions++;
  await payment.update({ amountCents: 10001 });
  const result = await createInternalChallengeSettlement(db, input);
  assert.equal(result.created, true); assertions++;
  assert.equal((await db.collection("winnerProposals").doc(id).get()).data().status, "approved"); assertions++;
  const credits = await db.collection("cashLedger").where("challengeId", "==", id).get();
  assert.equal(credits.docs.reduce((sum, document) => sum + Number(document.data().netAmountCents), 0), 10001); assertions++;
  assert.equal(credits.docs.every(document => document.data().externalPayoutExecuted === false), true); assertions++;
  const retry = await createInternalChallengeSettlement(db, input);
  assert.equal(retry.idempotent, true); assertions++;
  assert.equal((await db.collection("cashLedger").where("challengeId", "==", id).get()).size, credits.size); assertions++;
  assert.equal((await db.collection("normalLifecycleJobs").doc(`normal_${id}`).get()).exists, true); assertions++;
  console.log(`Normal settlement emulator: ${assertions} assertions passed.`);
} finally {
  for (const collection of ["challenges", "winnerProposals", "normalLifecycleEvents", "creatorPrizeFundingPayments"]) await db.collection(collection).doc(id).delete();
  await db.collection("normalLifecycleJobs").doc(`normal_${id}`).delete();
  for (const collection of ["submissions", "challengeParticipants", "cashLedger", "challengeSettlements", "auditLogs", "platformLedger"]) {
    const docs = await db.collection(collection).where("challengeId", "==", id).get();
    await Promise.all(docs.docs.map(document => document.ref.delete()));
  }
  for (const winner of winners) await db.collection("cashWallets").doc(winner.userId).delete();
  const notifications = await db.collection("notifications").where("targetId", "==", id).get();
  await Promise.all(notifications.docs.map(document => document.ref.delete()));
  await deleteApp(app);
}
