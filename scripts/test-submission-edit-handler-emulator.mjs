import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore } from "firebase-admin/firestore";
import { getStorage } from "firebase-admin/storage";

assert.ok(process.env.FIRESTORE_EMULATOR_HOST, "FIRESTORE_EMULATOR_HOST is required");
assert.ok(process.env.FIREBASE_AUTH_EMULATOR_HOST, "FIREBASE_AUTH_EMULATOR_HOST is required");
assert.ok(process.env.FIREBASE_STORAGE_EMULATOR_HOST, "FIREBASE_STORAGE_EMULATOR_HOST is required");
const projectId = process.env.GCLOUD_PROJECT ?? "demo-challenge-suite";
const bucketName = `${projectId}.firebasestorage.app`;
process.env.FIREBASE_PROJECT_ID = projectId;
process.env.FIREBASE_STORAGE_BUCKET = bucketName;
process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET = bucketName;
const app = initializeApp({ projectId, storageBucket: bucketName });
const db = getFirestore(app);
const auth = getAuth(app);
const storage = getStorage(app);
const testId = `submission_edit_${randomUUID().replaceAll("-", "")}`;
let assertionCount = 0;
function equal(actual, expected, message) { assertionCount += 1; assert.equal(actual, expected, message); }
function ok(condition, message) { assertionCount += 1; assert.ok(condition, message); }

async function newUser(label) {
  const email = `${testId}_${label}@example.test`;
  const response = await fetch(`http://${process.env.FIREBASE_AUTH_EMULATOR_HOST}/identitytoolkit.googleapis.com/v1/accounts:signUp?key=fake-api-key`, {
    method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ email, password: "TestPassword123!", returnSecureToken: true })
  });
  const body = await response.json();
  assert.equal(response.ok, true, JSON.stringify(body));
  await auth.updateUser(body.localId, { emailVerified: true });
  const signedIn = await fetch(`http://${process.env.FIREBASE_AUTH_EMULATOR_HOST}/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=fake-api-key`, {
    method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ email, password: "TestPassword123!", returnSecureToken: true })
  });
  const signedInBody = await signedIn.json();
  assert.equal(signedIn.ok, true, JSON.stringify(signedInBody));
  await db.collection("users").doc(body.localId).set({ accountType: "creator", role: "creator" });
  return { uid: body.localId, token: signedInBody.idToken };
}

function jsonRequest(token, body) {
  return new Request("http://localhost/api/submissions/test_submission", { method: "PATCH", headers: { authorization: `Bearer ${token}`, "content-type": "application/json" }, body: JSON.stringify(body) });
}

try {
  const owner = await newUser("owner");
  const unrelated = await newUser("unrelated");
  const challengeId = `${testId}_challenge`;
  const submissionId = `${challengeId}_${owner.uid}`;
  const deadline = new Date(Date.now() + 60 * 60_000).toISOString();
  const challengeRef = db.collection("challenges").doc(challengeId);
  const submissionRef = db.collection("submissions").doc(submissionId);
  const participantRef = db.collection("challengeParticipants").doc(`${challengeId}_${owner.uid}`);
  const mediaPath = `challenges/${challengeId}/submissions/${owner.uid}/images/edit.jpg`;
  await challengeRef.set({ id: challengeId, creatorId: "another_creator", title: "Open submission edit", type: "Public Challenge", status: "active", visibility: "public", acceptedSubmissionTypes: ["image"], submissionStartAt: new Date(Date.now() - 60_000).toISOString(), submissionDeadline: deadline, startsAt: new Date(Date.now() - 60_000).toISOString(), endsAt: new Date(Date.now() + 2 * 60 * 60_000).toISOString(), votingStartsAt: deadline, votingDeadline: new Date(Date.now() + 90 * 60_000).toISOString(), winnerAnnouncementAt: new Date(Date.now() + 2 * 60 * 60_000).toISOString(), paidEntryEnabled: false });
  await participantRef.set({ challengeId, userId: owner.uid, status: "active", entryPaymentStatus: "not_required" });
  await submissionRef.set({ id: submissionId, challengeId, userId: owner.uid, participantId: participantRef.id, status: "pending_review", title: "Original title", description: "Original description", mediaUrl: "https://firebasestorage.googleapis.com/v0/b/demo-challenge-suite.firebasestorage.app/o/old", mediaStoragePath: `challenges/${challengeId}/submissions/${owner.uid}/images/old.jpg`, mediaType: "image", fileSize: 3, revisionNumber: 0, reviewedAt: "2026-01-01T00:00:00.000Z", reviewedBy: "moderator_1", rejectionReason: null });
  await storage.bucket(bucketName).file(mediaPath).save(Buffer.from("image-bytes"), { resumable: false, metadata: { contentType: "image/jpeg" } });
  const mediaUrl = `https://firebasestorage.googleapis.com/v0/b/${bucketName}/o/${encodeURIComponent(mediaPath)}?alt=media&token=${testId}`;
  const { PATCH } = await import("../app/api/submissions/[id]/route.ts");
  const params = { params: Promise.resolve({ id: submissionId }) };
  const body = { title: "Updated title", description: "Updated caption", mediaUrl, mediaType: "image", originalFileName: "edit.jpg", fileSize: 11, mediaStoragePath: mediaPath, expectedRevision: 0 };
  const updateResponse = await PATCH(jsonRequest(owner.token, body), params);
  if (updateResponse.status !== 200) console.log("submission update diagnostic:", await updateResponse.json());
  equal(updateResponse.status, 200, "submission owner can update before deadline");
  const updated = (await submissionRef.get()).data();
  equal(updated.title, body.title, "new title persisted");
  equal(updated.revisionNumber, 1, "revision increments once");
  equal(updated.status, "pending_review", "existing moderation state is preserved");
  equal(updated.reviewedBy, "moderator_1", "moderation history remains intact");
  equal((await db.collection("submissionRevisions").doc(`${submissionId}_v1`).get()).exists, true, "immutable revision history record is created");
  equal((await PATCH(jsonRequest(owner.token, body), params)).status, 409, "stale concurrent retry cannot overwrite a newer revision");
  equal((await PATCH(jsonRequest(unrelated.token, { ...body, expectedRevision: 1 }), params)).status, 403, "unrelated user cannot edit the submission");
  await challengeRef.set({ submissionDeadline: new Date(Date.now() - 1).toISOString() }, { merge: true });
  equal((await PATCH(jsonRequest(owner.token, { ...body, expectedRevision: 1 }), params)).status, 409, "edit at or after the deadline is rejected");
  equal((await submissionRef.get()).data().revisionNumber, 1, "deadline rejection writes no new revision");
  console.log(`PASS actual submission PATCH handler against Auth, Firestore, and Storage Emulators: ${assertionCount} assertions.`);
} finally {
  await app.delete();
}
