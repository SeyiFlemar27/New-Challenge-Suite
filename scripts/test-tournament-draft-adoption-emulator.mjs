import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { initializeApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import { adoptTournamentDraftPolicy } from "../lib/server/tournament-draft-adoption.ts";
import { TOURNAMENT_PRODUCT_POLICY } from "../lib/tournament-builder-policy.ts";
assert.match(process.env.GCLOUD_PROJECT ?? "", /^demo-/);
assert.match(process.env.FIRESTORE_EMULATOR_HOST ?? "", /^127\.0\.0\.1:\d+$/);
const app = initializeApp({ projectId: process.env.GCLOUD_PROJECT });
const db = getFirestore(app), prefix = `adopt_${randomUUID()}`, owner = `${prefix}_owner`;
let assertions = 0;
const equal = (actual, expected) => { assert.equal(actual, expected); assertions++; };
const ids = [];
async function fixture(suffix, extra = {}) {
  const id = `${prefix}_${suffix}`; ids.push(id);
  const record = { id, hostId: owner, title: "Preserved draft", description: "Existing paragraphs.\n\nExisting second paragraph.", tournamentRules: "First rule\nSecond rule", submissionInstructions: "First instruction\nSecond instruction", status: "draft", configVersion: 2, format: "single_elimination", participationMode: "individual", participantCapacity: 8, participantCount: 0, privacy: "private", entryType: "free", createdAt: "2026-10-01T00:00:00.000Z", updatedAt: "2026-10-02T00:00:00.000Z", coverMedia: { path: `tournaments/drafts/${owner}/cover/existing.png`, url: "https://example.test/existing.png", status: "uploaded" }, ...extra };
  await db.collection("tournaments").doc(id).set(record); return record;
}
const input = record => ({ tournamentId: record.id, actor: { uid: owner, role: "creator" }, confirmed: true, expectedUpdatedAt: record.updatedAt });
try {
  await db.collection("users").doc(owner).set({ role: "creator", planId: "creator", planStatus: "active", accountStatus: "active" });
  const original = await fixture("original");
  await assert.rejects(adoptTournamentDraftPolicy(db, { ...input(original), confirmed: false }), /CONFIRMATION_REQUIRED/); assertions++;
  await assert.rejects(adoptTournamentDraftPolicy(db, { ...input(original), actor: { uid: "other" } }), /OWNER_REQUIRED/); assertions++;
  await assert.rejects(adoptTournamentDraftPolicy(db, { ...input(original), expectedUpdatedAt: "stale" }), /DRAFT_STALE/); assertions++;
  equal((await adoptTournamentDraftPolicy(db, input(original))).adopted, true);
  const migrated = (await db.collection("tournaments").doc(original.id).get()).data();
  equal(migrated.productPolicyVersion, TOURNAMENT_PRODUCT_POLICY);
  equal(migrated.description, original.description);
  equal(migrated.coverMedia.path, original.coverMedia.path);
  equal(migrated.createdAt, original.createdAt);
  assert.deepEqual(migrated.tournamentRules, ["First rule", "Second rule"]); assertions++;
  assert.deepEqual(migrated.submissionInstructions, ["First instruction", "Second instruction"]); assertions++;
  equal(migrated.status, "draft"); equal(migrated.privacy, "public"); equal(migrated.paymentActivationEnabled, false); equal(migrated.payoutExecutionEnabled, false);
  const archive = await db.collection("tournamentDraftPolicyRevisions").doc(migrated.draftPolicyRevisionId).get();
  assert.deepEqual(archive.data().before, original); assertions++;
  equal((await adoptTournamentDraftPolicy(db, input(original))).duplicate, true);
  equal((await db.collection("tournamentDraftPolicyRevisions").where("tournamentId", "==", original.id).get()).size, 1);
  for (const [label, collection, field] of [["payment", "creatorPrizeFundingPayments", "challengeId"], ["participant", "tournamentParticipants", "tournamentId"], ["refund", "refundCases", "tournamentId"]]) {
    const record = await fixture(label);
    await db.collection(collection).doc(record.id).set({ [field]: record.id, status: "pending" });
    await assert.rejects(adoptTournamentDraftPolicy(db, input(record)), /ACTIVITY_REVIEW_REQUIRED/); assertions++;
    equal((await db.collection("tournaments").doc(record.id).get()).data().configVersion, 2);
    await db.collection(collection).doc(record.id).delete();
  }
  const published = await fixture("published", { status: "registration_open" });
  await assert.rejects(adoptTournamentDraftPolicy(db, input(published)), /ACTIVITY_REVIEW_REQUIRED/); assertions++;
  console.log(`Tournament unused-draft adoption: ${assertions} Firestore assertions passed; existing financial or competition activity is held unchanged.`);
} finally {
  for (const id of ids) {
    for (const collection of ["tournamentDraftPolicyRevisions", "tournamentAuditEvents"]) {
      const rows = await db.collection(collection).where("tournamentId", "==", id).get(); await Promise.all(rows.docs.map(row => row.ref.delete()));
    }
    await db.collection("tournaments").doc(id).delete();
  }
  await db.collection("users").doc(owner).delete(); await db.terminate();
}
