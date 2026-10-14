import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { initializeApp, deleteApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import { assertNormalMaterialChange, proposeNormalMaterialChange, decideNormalMaterialChange } from "../lib/server/normal-material-review.ts";
assert.match(process.env.GCLOUD_PROJECT ?? "", /^demo-/);
assert.match(process.env.FIRESTORE_EMULATOR_HOST ?? "", /^(127\.0\.0\.1|localhost):\d+$/);
const app = initializeApp({ projectId: process.env.GCLOUD_PROJECT }), db = getFirestore(app), id = `material_${randomUUID()}`, now = Date.now();
const before = { builderVersion: "normal_v3", status: "registration_open", creatorId: "fixture_creator", updatedAt: new Date(now).toISOString(), challengeRules: ["Original rule"], registrationDeadline: new Date(now + 3600_000).toISOString(), submissionDeadline: new Date(now + 7200_000).toISOString(), votingDeadline: new Date(now + 10800_000).toISOString() };
let count = 0;
const check = (a,b,m) => { assert.deepEqual(a,b,m); count++; };
try {
  await db.collection("challenges").doc(id).set(before);
  assert.throws(() => assertNormalMaterialChange(before, { prizeValue: 100 }, now)); count++;
  assert.throws(() => assertNormalMaterialChange(before, { submissionDeadline: new Date(now + 1000).toISOString() }, now)); count++;
  assert.throws(() => assertNormalMaterialChange({ ...before, effectiveVotingStartsAt: before.updatedAt }, { challengeRules: ["New rule"] }, now)); count++;
  const proposal = await proposeNormalMaterialChange(db, id, "fixture_creator", before.updatedAt, { challengeRules: ["Reviewed rule"] }, "Clarify the competition rules");
  check((await db.collection("challenges").doc(id).get()).data().challengeRules, before.challengeRules, "proposal cannot change published values");
  const decisions = await Promise.all([decideNormalMaterialChange(db, proposal.id, "fixture_admin", "approve", "Approved after reviewing participant protections"), decideNormalMaterialChange(db, proposal.id, "fixture_admin", "approve", "Approved after reviewing participant protections")]);
  check(decisions.filter(item => item.duplicate).length, 1, "concurrent approval applies once");
  check((await db.collection("challenges").doc(id).get()).data().normalContentRevision, 1, "revision increments once");
  check((await db.collection("normalNotificationOutbox").doc(`material_${proposal.id}`).get()).exists, true, "decision has durable notification");
  const current = (await db.collection("challenges").doc(id).get()).data();
  const rejected = await proposeNormalMaterialChange(db, id, "fixture_creator", current.updatedAt, { challengeRules: ["Never applied"] }, "Propose a different rule");
  await decideNormalMaterialChange(db, rejected.id, "fixture_admin", "reject", "Rejected to preserve current protections");
  check((await db.collection("challenges").doc(id).get()).data().challengeRules, ["Reviewed rule"], "rejected change cannot take effect");
  const stale = await proposeNormalMaterialChange(db, id, "fixture_creator", current.updatedAt, { challengeRules: ["Stale rule"] }, "Propose a future correction");
  await db.collection("challenges").doc(id).update({ updatedAt: new Date(now + 50).toISOString() });
  await assert.rejects(decideNormalMaterialChange(db, stale.id, "fixture_admin", "approve", "Attempt a stale approval"), /CHALLENGE_STATE_CHANGED/); count++;
  console.log(`Normal material review: ${count} assertions passed.`);
} finally {
  for (const collection of ["normalMaterialChangeRequests", "normalNotificationOutbox", "auditLogs"]) {
    const rows = await db.collection(collection).where("challengeId", "==", id).get();
    await Promise.all(rows.docs.map(row => row.ref.delete()));
  }
  await db.collection("normalLifecycleJobs").doc(`normal_${id}`).delete(); await db.collection("challenges").doc(id).delete(); await deleteApp(app);
}
