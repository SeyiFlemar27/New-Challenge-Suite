import assert from "node:assert/strict";
import { initializeApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import { prepareEnterpriseActiveChallengeRelease, prepareEnterpriseActiveChallengeSlot } from "../lib/server/enterprise-active-challenge-limit.ts";
import { enterpriseChallengeInScope, hasEnterprisePermission, normalizeEnterpriseAccess } from "../lib/enterprise-access.ts";

assert.ok(process.env.FIRESTORE_EMULATOR_HOST, "FIRESTORE_EMULATOR_HOST is required");
const app = initializeApp({ projectId: process.env.GCLOUD_PROJECT ?? "demo-challenge-suite" }, `enterprise-active-cap-${Date.now()}`);
const db = getFirestore(app);
const runId = `active_cap_${Date.now()}_${Math.random().toString(36).slice(2)}`;
const orgA = `${runId}_org_a`;
const orgB = `${runId}_org_b`;
const ids = [];

async function createActiveChallenge(organizationId, id) {
  ids.push(id);
  await db.collection("challenges").doc(id).set({ organizationOwnerId: organizationId, status: "active", createdAt: new Date().toISOString() });
}

async function reserve(organizationId, challengeId) {
  return db.runTransaction(async (transaction) => {
    const slot = await prepareEnterpriseActiveChallengeSlot(db, transaction, organizationId, challengeId);
    slot.apply();
    transaction.set(db.collection("challenges").doc(challengeId), { organizationOwnerId: organizationId, status: "pending_review" }, { merge: true });
  });
}

try {
  for (let index = 0; index < 9; index += 1) await createActiveChallenge(orgA, `${runId}_existing_a_${index}`);
  const competing = [`${runId}_new_a_1`, `${runId}_new_a_2`];
  ids.push(...competing);
  const outcomes = await Promise.allSettled(competing.map((challengeId) => reserve(orgA, challengeId)));
  assert.equal(outcomes.filter((item) => item.status === "fulfilled").length, 1, "only one of two concurrent activations can consume slot ten");
  assert.equal(outcomes.filter((item) => item.status === "rejected" && String(item.reason).includes("EnterpriseActiveChallengeLimitError")).length, 1);
  assert.equal((await db.collection("enterpriseChallengeQuotas").doc(orgA).get()).data()?.activeCount, 10);

  const activeReservations = await db.collection("enterpriseChallengeReservations").where("organizationId", "==", orgA).where("status", "==", "active").get();
  assert.equal(activeReservations.size, 10, "the quota bootstrap and winning candidate create ten reservations");
  const duplicateId = competing.find((id) => activeReservations.docs.some((doc) => doc.id === id));
  assert.ok(duplicateId);
  await reserve(orgA, duplicateId);
  assert.equal((await db.collection("enterpriseChallengeQuotas").doc(orgA).get()).data()?.activeCount, 10, "duplicate activation is idempotent");
  await assert.rejects(() => reserve(orgA, `${runId}_over_limit`), /EnterpriseActiveChallengeLimitError/);

  await createActiveChallenge(orgB, `${runId}_existing_b`);
  const orgBChallenge = `${runId}_new_b`;
  ids.push(orgBChallenge);
  await reserve(orgB, orgBChallenge);
  assert.equal((await db.collection("enterpriseChallengeQuotas").doc(orgB).get()).data()?.activeCount, 2, "organization counters are isolated");

  await db.runTransaction(async (transaction) => {
    const challengeRef = db.collection("challenges").doc(duplicateId);
    const challengeSnap = await transaction.get(challengeRef);
    const release = await prepareEnterpriseActiveChallengeRelease(db, transaction, orgA, duplicateId);
    transaction.set(challengeRef, { status: "cancelled" }, { merge: true });
    release.apply();
    assert.ok(challengeSnap.exists);
  });
  assert.equal((await db.collection("enterpriseChallengeQuotas").doc(orgA).get()).data()?.activeCount, 9, "cancellation releases the reserved slot");
  await reserve(orgA, `${runId}_replacement_a`);
  ids.push(`${runId}_replacement_a`);
  assert.equal((await db.collection("enterpriseChallengeQuotas").doc(orgA).get()).data()?.activeCount, 10);
  const completedId = `${runId}_completed_b`;
  ids.push(completedId);
  await reserve(orgB, completedId);
  await db.runTransaction(async (transaction) => {
    const challengeRef = db.collection("challenges").doc(completedId);
    await transaction.get(challengeRef);
    const release = await prepareEnterpriseActiveChallengeRelease(db, transaction, orgB, completedId);
    transaction.set(challengeRef, { status: "completed" }, { merge: true });
    release.apply();
  });
  assert.equal((await db.collection("enterpriseChallengeQuotas").doc(orgB).get()).data()?.activeCount, 2, "completion releases the active slot");
  const challenge = { officialChallenge: true, organizationOwnerId: orgA, enterpriseAssignments: [{ userId: "manager-a", status: "active" }] };
  const revoked = normalizeEnterpriseAccess({ enterpriseAccessStatus: "approved", enterpriseRole: "operations", enterpriseOrganizationId: orgA, staffAccess: { status: "revoked", role: "operations", scope: "assigned_only", organizationId: orgA, permissions: ["challenge.edit"] } });
  const expired = normalizeEnterpriseAccess({ enterpriseAccessStatus: "approved", enterpriseRole: "operations", enterpriseOrganizationId: orgA, staffAccess: { status: "active", role: "operations", scope: "assigned_only", organizationId: orgA, permissions: ["challenge.edit"], expiresAt: "2000-01-01T00:00:00.000Z" } });
  assert.equal(hasEnterprisePermission(revoked, "challenge.edit"), false, "revoked managers cannot pass the upstream activation permission check");
  assert.equal(hasEnterprisePermission(expired, "challenge.edit"), false, "expired managers cannot pass the upstream activation permission check");
  assert.equal(enterpriseChallengeInScope(expired, challenge, "manager-a", true), true, "scope alone is insufficient without an active permission");
  console.log("PASS Firestore Emulator Enterprise active-challenge cap: 9+2 concurrent, duplicate, limit rejection, cancel/complete release, organization isolation; revoked/expired permission checks deny");
} finally {
  const cleanup = ids.map((id) => db.collection("challenges").doc(id).delete());
  cleanup.push(db.collection("enterpriseChallengeQuotas").doc(orgA).delete(), db.collection("enterpriseChallengeQuotas").doc(orgB).delete());
  cleanup.push(...ids.map((id) => db.collection("enterpriseChallengeReservations").doc(id).delete()));
  await Promise.all(cleanup);
  await app.delete();
}
