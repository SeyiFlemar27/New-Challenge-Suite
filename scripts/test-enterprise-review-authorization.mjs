import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { initializeApp, deleteApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import { commitChallengeReviewSubmission } from "../lib/server/challenge-review-submission.ts";

assert.ok(process.env.FIRESTORE_EMULATOR_HOST);
assert.match(process.env.GCLOUD_PROJECT ?? "", /^demo-/);
const app = initializeApp({ projectId: process.env.GCLOUD_PROJECT });
const db = getFirestore(app);
const prefix = `review_scope_${randomUUID()}`;
const orgId = `${prefix}_org`;
const managerId = `${prefix}_manager`;
const refs = [];
const ref = (collection, id) => { const value = db.collection(collection).doc(id); refs.push(value); return value; };
const organization = ref("enterpriseOrganizations", orgId);
const account = ref("users", managerId);
const access = { enterpriseAccessStatus: "approved", enterpriseRole: "operations", enterpriseOrganizationId: orgId, staffAccess: { status: "active", role: "operations", scope: "all_official", organizationId: orgId } };
const now = new Date().toISOString();

async function attempt(label, overrides = {}) {
  const id = `${prefix}_${label}`;
  const challenge = { id, creatorId: "original-lead", officialChallenge: true, ownershipType: "challenge_suite_official", organizationOwnerId: orgId, status: "draft", prizeValue: 0, ...overrides };
  await ref("challenges", id).set(challenge);
  for (const [collection, key] of [["prizePools", id], ["enterpriseChallengeReservations", id], ["enterpriseChallengePrizeLimits", id], ["revenueShareLedgers", `revenue_share_${id}`], ["challengeReviewRevisions", `${id}_revision`], ["auditLogs", `${id}_submit`], ["auditLogs", `${id}_audit`]]) ref(collection, key);
  return { id, run: () => commitChallengeReviewSubmission(db, {
    challengeId: id, userId: managerId, expectedStatus: "draft",
    update: { status: "pending_review", updatedAt: now, prizeValue: 0 },
    revision: { id: `${id}_revision` }, revenue: { creatorId: managerId, financialOwnerId: managerId },
    submitAudit: { id: `${id}_submit` }, revisionAudit: { id: `${id}_audit` },
    prizePool: { prizeType: "none", prizeValueCents: 0, now },
  }) };
}

try {
  await organization.set({ status: "active" });
  await account.set(access);
  const permitted = await attempt("permitted");
  await permitted.run();
  const ledger = (await db.collection("revenueShareLedgers").doc(`revenue_share_${permitted.id}`).get()).data();
  assert.equal(ledger.creatorId, null);
  assert.equal(ledger.financialOwnerId, orgId, "transaction derives the owner from its own challenge snapshot");
  assert.equal((await permitted.run()).idempotent, true);
  for (const [label, change, challengeChange] of [
    ["revoked", { ...access, staffAccess: { ...access.staffAccess, status: "revoked" } }, { creatorId: managerId }],
    ["foreign", access, { organizationOwnerId: `${prefix}_foreign` }],
    ["unassigned", { ...access, staffAccess: { ...access.staffAccess, scope: "assigned_only" } }, {}],
  ]) {
    await account.set(change);
    const denied = await attempt(label, challengeChange);
    await assert.rejects(denied.run, /Enterprise access/);
    assert.equal((await db.collection("challenges").doc(denied.id).get()).data().status, "draft");
    assert.equal((await db.collection("revenueShareLedgers").doc(`revenue_share_${denied.id}`).get()).exists, false);
  }
  await account.set(access);
  await organization.set({ status: "suspended" });
  const suspended = await attempt("suspended_org");
  await assert.rejects(suspended.run, /organization is not active/);
  console.log("PASS Enterprise review transaction: non-creator manager, canonical finance attribution, retries, revoked creator, foreign organization, assignment scope, and suspended organization");
} finally {
  refs.push(db.collection("enterpriseChallengeQuotas").doc(orgId));
  await Promise.all(refs.map((value) => value.delete()));
  await deleteApp(app);
}
