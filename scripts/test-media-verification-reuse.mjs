import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { initializeApp, deleteApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import { getStorage } from "firebase-admin/storage";
import sharp from "sharp";

assert.ok(process.env.FIREBASE_STORAGE_EMULATOR_HOST);
assert.ok(process.env.FIRESTORE_EMULATOR_HOST);
const projectId = process.env.GCLOUD_PROJECT;
assert.match(projectId ?? "", /^demo-/);
process.env.FIREBASE_PROJECT_ID = projectId;
process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID = projectId;
process.env.FIREBASE_STORAGE_BUCKET = `${projectId}.appspot.com`;
process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET = process.env.FIREBASE_STORAGE_BUCKET;
process.env.CHALLENGE_SUITE_USE_FIREBASE_EMULATORS = "true";
const app = initializeApp({ projectId, storageBucket: process.env.FIREBASE_STORAGE_BUCKET });
const db = getFirestore(app);
const bucket = getStorage(app).bucket();
const id = `media_reuse_${randomUUID()}`;
const sourcePath = `challenges/drafts/${id}/image.png`;
const { verifyChallengeMedia, applyVerifiedChallengeMedia } = await import("../lib/server/media-verification.ts");

try {
  const bytes = await sharp({ create: { width: 800, height: 500, channels: 3, background: "#357" } }).png().withMetadata({ density: 72 }).toBuffer();
  await bucket.file(sourcePath).save(bytes, { metadata: { contentType: "image/png" } });
  const challenge = { coverImagePath: sourcePath, challengeImages: [{ path: sourcePath }] };
  const verification = await verifyChallengeMedia(db, id, challenge, id);
  applyVerifiedChallengeMedia(challenge, verification);
  assert.equal(challenge.challengeImages[0].path, challenge.coverImagePath, "shared gallery and cover references must both use the verified object");
  assert.match(challenge.coverImagePath, /^verified-challenge-media\//);
  const repeated = await verifyChallengeMedia(db, id, challenge, id);
  assert.equal(repeated.status, "verified", "a persisted verified draft must remain verifiable on review submission");
  await assert.rejects(() => verifyChallengeMedia(db, `${id}_other`, challenge, id), /MEDIA_PATH_NOT_CHALLENGE_SCOPED/, "verified objects cannot be adopted by another challenge");
  console.log("PASS shared cover/gallery verification, repeat verification, and cross-challenge rejection");
} finally {
  await bucket.file(sourcePath).delete({ ignoreNotFound: true });
  await bucket.deleteFiles({ prefix: `verified-challenge-media/${id}/` });
  await deleteApp(app);
}
