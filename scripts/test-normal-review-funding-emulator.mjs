import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { initializeApp, deleteApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import { commitChallengeReviewSubmission } from "../lib/server/challenge-review-submission.ts";

assert.match(process.env.GCLOUD_PROJECT ?? "", /^demo-/);
assert.match(process.env.FIRESTORE_EMULATOR_HOST ?? "", /^(localhost|127\.0\.0\.1):\d+$/);
const app = initializeApp({ projectId: process.env.GCLOUD_PROJECT });
const db = getFirestore(app);
const prefix = `normal_review_${randomUUID()}`;
const refs = [];
const ref = (collection, id) => { const value = db.collection(collection).doc(id); refs.push(value); return value; };
let assertions = 0;
async function fixture(label, amount, payment = null, updateExtras = {}) {
  const id = `${prefix}_${label}`;
  await ref("challenges", id).set({ id, builderVersion: "normal_v3", creatorId: "fixture-owner", creatorPlanId: "host", freeBasicChallenge: false, status: "draft", prizeValue: amount, updatedAt: "v1" });
  if (payment) await ref("creatorPrizeFundingPayments", id).set({ challengeId: id, userId: "fixture-owner", paymentPurpose: "prize_pool_funding", currency: "USD", amountCents: amount * 100, status: "confirmed", webhookConfirmed: true, ...payment });
  for (const [collection, key] of [["prizePools", id], ["revenueShareLedgers", `revenue_share_${id}`], ["challengeReviewRevisions", `${id}_revision`], ["auditLogs", `${id}_submit`], ["auditLogs", `${id}_audit`]]) ref(collection, key);
  return { id, run: () => commitChallengeReviewSubmission(db, { challengeId: id, userId: "fixture-owner", expectedStatus: "draft", expectedUpdatedAt: "v1", update: { status: "scheduled", builderVersion: "normal_v3", prizeType: "money", creatorPlanId: "host", freeBasicChallenge: false, prizeValue: amount, updatedAt: "v2", ...updateExtras }, revision: { id: `${id}_revision` }, revenue: {}, submitAudit: { id: `${id}_submit` }, revisionAudit: { id: `${id}_audit` }, prizePool: { prizeType: "money", prizeValueCents: amount * 100 } }) };
}
try {
  await ref("users", "fixture-owner").set({ role: "creator", planId: "host", planStatus: "active", accountStatus: "active" });
  for (const [label, amount, payment, accepted] of [
    ["zero", 0, null, true], ["unfunded", 10, null, false],
    ["pending", 10, { status: "pending" }, false], ["unverified", 10, { webhookConfirmed: false }, false],
    ["partial", 10, { amountCents: 500 }, false], ["sponsor", 10, { paymentPurpose: "sponsor_funding" }, false],
    ["other-owner", 10, { userId: "other-user" }, false], ["refunded", 10, { status: "refunded" }, false],
    ["confirmed", 10, {}, true],
  ]) {
    const item = await fixture(label, amount, payment);
    if (accepted) assert.equal((await item.run()).idempotent, false);
    else await assert.rejects(item.run, /Confirm the full creator-funded/);
    assertions++;
    assert.equal((await db.collection("challenges").doc(item.id).get()).data().status, accepted ? "scheduled" : "draft"); assertions++;
  }
  const concurrent = await fixture("concurrent", 10, {});
  const outcomes = await Promise.all([concurrent.run(), concurrent.run()]);
  assert.equal(outcomes.filter(value => !value.idempotent).length, 1); assertions++;
  const stale = await fixture("stale", 0);
  await db.collection("challenges").doc(stale.id).update({ updatedAt: "changed" });
  await assert.rejects(stale.run, /draft or its funding changed/); assertions++;
  await db.collection("users").doc("fixture-owner").update({ planId: "free" });
  for (const label of ["used_one", "used_two"]) await ref("challenges", `${prefix}_${label}`).set({ creatorId: "fixture-owner", creatorPlanId: "free", freeBasicChallenge: true, status: "completed" });
  const freeA = await fixture("quota_a", 0, null, { freeBasicChallenge: true, creatorPlanId: "free" });
  const freeB = await fixture("quota_b", 0, null, { freeBasicChallenge: true, creatorPlanId: "free" });
  const quota = await Promise.allSettled([freeA.run(), freeB.run()]);
  assert.equal(quota.filter(result => result.status === "fulfilled").length, 1, "concurrent reviews consume one remaining Free Basic entitlement"); assertions++;
  assert.equal(quota.filter(result => result.status === "rejected" && /Free Basic/.test(result.reason.message)).length, 1, "over-limit review is rejected with an accurate explanation"); assertions++;
  const basicRows = await db.collection("challenges").where("creatorId", "==", "fixture-owner").get();
  assert.equal(basicRows.docs.filter(document => document.data().freeBasicChallenge === true && ["completed", "scheduled"].includes(document.data().status)).length, 3, "lifetime usage never exceeds the existing limit"); assertions++;
  const downgraded = await fixture("downgraded_paid_draft", 0, null, { freeBasicChallenge: true });
  await db.collection("challenges").doc(downgraded.id).update({ creatorPlanId: "creator" });
  await assert.rejects(downgraded.run, /Free Basic/, "an old paid-plan draft cannot bypass current Free Basic entitlement"); assertions++;
  assert.equal((await db.collection("challenges").doc(downgraded.id).get()).data().creatorPlanId, "creator", "quota rejection preserves the original creation metadata"); assertions++;
  console.log(`Normal review funding emulator: ${assertions} assertions passed.`);
} finally {
  await Promise.all(refs.map(value => value.delete()));
  await deleteApp(app);
}
