import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore } from "firebase-admin/firestore";
import { getStorage } from "firebase-admin/storage";

for (const variable of ["FIRESTORE_EMULATOR_HOST", "FIREBASE_AUTH_EMULATOR_HOST", "FIREBASE_STORAGE_EMULATOR_HOST"]) {
  assert.ok(process.env[variable], `${variable} is required`);
}
const projectId = process.env.GCLOUD_PROJECT ?? "demo-challenge-suite";
assert.match(projectId, /^demo-/, "media delivery tests require an isolated demo-* Firebase project");
const bucketName = `${projectId}.firebasestorage.app`;
process.env.FIREBASE_PROJECT_ID = projectId;
process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID = projectId;
process.env.FIREBASE_STORAGE_BUCKET = bucketName;
process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET = bucketName;
process.env.CHALLENGE_SUITE_USE_FIREBASE_EMULATORS = "true";

const app = initializeApp({ projectId, storageBucket: bucketName });
const db = getFirestore(app);
const auth = getAuth(app);
const storage = getStorage(app).bucket(bucketName);
const { GET } = await import("../app/api/challenge-media/route.ts");
const runId = `media_delivery_${randomUUID().replaceAll("-", "")}`;
let assertions = 0;

function check(value, message) { assertions += 1; assert.ok(value, message); }
function equal(actual, expected, message) { assertions += 1; assert.equal(actual, expected, message); }
function request(path, token = null, headers = {}) {
  const url = new URL("http://localhost/api/challenge-media");
  url.searchParams.set("path", path);
  return new Request(url, { headers: { ...(token ? { authorization: `Bearer ${token}` } : {}), ...headers } });
}
async function newUser(label, role = "creator") {
  const email = `${runId}_${label}@example.test`;
  const password = "TestPassword123!";
  const signUp = await fetch(`http://${process.env.FIREBASE_AUTH_EMULATOR_HOST}/identitytoolkit.googleapis.com/v1/accounts:signUp?key=fake-api-key`, {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ email, password, returnSecureToken: true })
  });
  const created = await signUp.json();
  assert.equal(signUp.ok, true, `Auth Emulator signup failed: ${JSON.stringify(created)}`);
  await auth.updateUser(created.localId, { emailVerified: true });
  const signedIn = await fetch(`http://${process.env.FIREBASE_AUTH_EMULATOR_HOST}/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=fake-api-key`, {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ email, password, returnSecureToken: true })
  });
  const token = await signedIn.json();
  assert.equal(signedIn.ok, true, `Auth Emulator login failed: ${JSON.stringify(token)}`);
  await db.collection("users").doc(created.localId).set({ role, accountType: role, accountStatus: "active", emailVerified: true });
  return { uid: created.localId, token: token.idToken };
}
async function object(path, contentType = "image/png", body = "media-fixture") {
  await storage.file(path).save(Buffer.from(body), { resumable: false, metadata: { contentType } });
}
async function read(path, token = null, headers = {}) {
  return GET(request(path, token, headers));
}
async function body(response) { return Buffer.from(await response.arrayBuffer()).toString(); }

try {
  const owner = await newUser("owner");
  const outsider = await newUser("outsider");

  for (const namespace of ["drafts", "host-drafts", "hybrid-drafts"]) {
    const id = `${runId}_${namespace}`;
    const path = `challenges/${namespace}/${owner.uid}/banner/legacy.png`;
    const gallery = `challenges/${namespace}/${owner.uid}/gallery/gallery.png`;
    const unreferenced = `challenges/${namespace}/${owner.uid}/gallery/unreferenced.png`;
    const trailer = `challenges/${namespace}/${owner.uid}/video/private.mp4`;
    await Promise.all([object(path), object(gallery), object(unreferenced), object(trailer, "video/mp4")]);
    const record = db.collection("challenges").doc(id);
    await record.set({ creatorId: owner.uid, type: "Normal", visibility: "public", status: "published", coverImagePath: path, challengeImages: [{ path: gallery }], publicMediaPaths: [path, gallery], trailerVideoPath: trailer });
    equal((await read(path)).status, 200, `${namespace} referenced published cover is served while signed out`);
    equal((await read(gallery)).status, 200, `${namespace} projected public gallery is served`);
    equal((await read(unreferenced)).status, 404, `${namespace} unreferenced draft stays protected`);
    equal((await read(trailer)).status, 404, `${namespace} draft trailer stays protected`);
    await record.update({ status: "draft" });
    equal((await read(path)).status, 404, `${namespace} unpublished cover stays protected`);
    await record.update({ status: "registration_open", visibility: "private", type: "Private Challenge", publicPreviewEnabled: false });
    equal((await read(path)).status, 404, `${namespace} hidden private cover stays protected`);
    await record.update({ publicPreviewEnabled: true });
    equal((await read(path)).status, 200, `${namespace} eligible locked preview exposes cover only`);
    equal((await read(gallery)).status, 404, `${namespace} private gallery stays protected`);
    await record.update({ creatorId: outsider.uid, visibility: "public", type: "Normal", status: "published" });
    equal((await read(path)).status, 404, `${namespace} foreign draft reference cannot grant public access`);
  }

  const publicId = `${runId}_public`;
  const publicCover = `verified-challenge-media/${publicId}/images/cover.png`;
  const publicGallery = `verified-challenge-media/${publicId}/images/gallery.png`;
  const hiddenGallery = `verified-challenge-media/${publicId}/images/not-referenced.png`;
  await Promise.all([object(publicCover, "image/png", "cover-bytes"), object(publicGallery), object(hiddenGallery)]);
  await db.collection("challenges").doc(publicId).set({
    id: publicId, creatorId: owner.uid, type: "Normal", visibility: "public", status: "published", publicVisibility: true,
    coverImagePath: publicCover, challengeImages: [{ path: publicCover }, { path: publicGallery }]
  });
  const publicCoverResponse = await read(publicCover);
  equal(publicCoverResponse.status, 200, "signed-out visitor can read a referenced public Challenge cover");
  equal((await read(publicCover, outsider.token)).status, 200, "signed-in visitor can read the same public cover without joining");
  equal(await body(publicCoverResponse), "cover-bytes", "public media endpoint streams the actual stored bytes");
  equal(publicCoverResponse.headers.get("cache-control"), "no-store", "public response avoids stale shared caching after visibility changes");
  const rangeResponse = await read(publicCover, null, { range: "bytes=0-3" });
  equal(rangeResponse.status, 206, "public media supports byte-range reads");
  equal(await body(rangeResponse), "cove", "range response returns only requested bytes");
  equal((await read(hiddenGallery)).status, 404, "unreferenced object is not exposed by a public Challenge path");

  const privateId = `${runId}_private`;
  const privateCover = `verified-challenge-media/${privateId}/images/cover.png`;
  const privateGallery = `verified-challenge-media/${privateId}/images/gallery.png`;
  const privateTrailer = `verified-challenge-media/${privateId}/videos/trailer.mp4`;
  await Promise.all([object(privateCover), object(privateGallery), object(privateTrailer, "video/mp4")]);
  await db.collection("challenges").doc(privateId).set({
    id: privateId, creatorId: owner.uid, type: "Private / Exclusive", visibility: "private", status: "registration_open",
    publicPreviewEnabled: true, publicVisibility: true, coverImagePath: privateCover,
    challengeImages: [{ path: privateCover }, { path: privateGallery }], trailerVideoPath: privateTrailer
  });
  equal((await read(privateCover)).status, 200, "signed-out visitor can read an eligible locked-preview cover");
  equal((await read(privateCover, outsider.token)).status, 200, "signed-in visitor can read an eligible locked-preview cover only");
  equal((await read(privateGallery)).status, 404, "locked preview does not disclose a private gallery asset");
  equal((await read(privateTrailer)).status, 404, "locked preview does not disclose a restricted trailer");
  equal((await read(privateGallery, outsider.token)).status, 404, "unrelated authenticated user cannot read private gallery media");
  equal((await read(privateGallery, owner.token)).status, 200, "private Challenge owner can read the referenced gallery");
  const admitted = await newUser("admitted");
  await db.collection("privateChallengeAccess").doc(`${privateId}_${admitted.uid}`).set({ challengeId: privateId, userId: admitted.uid, status: "approved" });
  equal((await read(privateGallery, admitted.token)).status, 200, "approved private access grant can read protected gallery media");

  const participant = await newUser("participant");
  await db.collection("challengeParticipants").doc(`${privateId}_${participant.uid}`).set({ challengeId: privateId, userId: participant.uid, status: "active" });
  equal((await read(privateGallery, participant.token)).status, 200, "private participant record grants participant media access");

  const hiddenPrivateId = `${runId}_hidden_private`;
  const hiddenPrivateCover = `verified-challenge-media/${hiddenPrivateId}/images/cover.png`;
  await object(hiddenPrivateCover);
  await db.collection("challenges").doc(hiddenPrivateId).set({
    id: hiddenPrivateId, creatorId: owner.uid, type: "Private / Exclusive", visibility: "private", status: "registration_open",
    publicPreviewEnabled: true, publicVisibility: false, coverImagePath: hiddenPrivateCover
  });
  equal((await read(hiddenPrivateCover)).status, 404, "creator-disabled discoverability blocks signed-out private preview access");

  const organizationId = `${runId}_org`;
  const enterpriseManager = await newUser("enterprise", "enterprise");
  await db.collection("enterpriseOrganizations").doc(organizationId).set({ status: "active" });
  await db.collection("users").doc(enterpriseManager.uid).set({
    role: "enterprise", accountType: "enterprise", accountStatus: "active", emailVerified: true,
    enterpriseAccessStatus: "approved", enterpriseRole: "operations", enterpriseOrganizationId: organizationId,
    staffAccess: { status: "active", organizationStatus: "active", organizationId, role: "operations", scope: "all_official", permissions: ["challenge.view"], categoryScope: [], regionScope: [], onboardingComplete: true, expiresAt: null }
  }, { merge: true });
  const officialId = `${runId}_official`;
  const officialImage = `verified-challenge-media/${officialId}/images/cover.png`;
  const officialTrailer = `verified-challenge-media/${officialId}/videos/trailer.mp4`;
  await Promise.all([object(officialImage), object(officialTrailer, "video/mp4")]);
  await db.collection("challenges").doc(officialId).set({
    id: officialId, officialChallenge: true, ownershipType: "challenge_suite_official", organizationOwnerId: organizationId,
    enterpriseAssignedUserIds: [enterpriseManager.uid], visibility: "public", status: "published", coverImagePath: officialImage, trailerVideoPath: officialTrailer
  });
  equal((await read(officialTrailer, enterpriseManager.token)).status, 200, "authorized Enterprise manager can read restricted official Challenge media");
  equal((await read(officialTrailer, outsider.token)).status, 404, "unrelated user cannot read restricted official Challenge media");

  const officialPrivateId = `${runId}_official_private`;
  const officialPrivateCover = `verified-challenge-media/${officialPrivateId}/images/cover.png`;
  await object(officialPrivateCover, "image/png", "enterprise-private-cover");
  await db.collection("challenges").doc(officialPrivateId).set({
    id: officialPrivateId, officialChallenge: true, ownershipType: "challenge_suite_official", organizationOwnerId: organizationId,
    enterpriseAssignedUserIds: [enterpriseManager.uid], creatorId: owner.uid, visibility: "private", type: "Private / Exclusive",
    status: "published", publicPreviewEnabled: false, coverImagePath: officialPrivateCover
  });
  equal((await read(officialPrivateCover, enterpriseManager.token)).status, 200, "Enterprise manager with challenge.view can read assigned official private media through the server-authorized route");
  equal(await body(await read(officialPrivateCover, enterpriseManager.token)), "enterprise-private-cover", "Enterprise private-media route streams the exact stored object");
  equal((await read(officialPrivateCover, outsider.token)).status, 404, "unrelated user cannot read official private media through the application route");
  equal((await read(officialPrivateCover)).status, 404, "signed-out visitor cannot read non-discoverable official private media");

  const submissionOwner = await newUser("submission_owner");
  const submissionChallenge = `${runId}_submission_challenge`;
  const submissionId = `${runId}_submission`;
  const submissionPath = `challenges/${submissionChallenge}/submissions/${submissionOwner.uid}/images/entry.png`;
  const rejectedPath = `challenges/${submissionChallenge}/submissions/${submissionOwner.uid}/images/rejected.png`;
  await Promise.all([object(submissionPath), object(rejectedPath)]);
  await db.collection("challenges").doc(submissionChallenge).set({ id: submissionChallenge, type: "Normal", visibility: "public", status: "published" });
  await db.collection("submissions").doc(submissionId).set({
    id: submissionId, challengeId: submissionChallenge, userId: submissionOwner.uid, mediaStoragePath: submissionPath,
    status: "approved", visibility: "public", publicVisibility: true
  });
  equal((await read(submissionPath)).status, 200, "approved public participant submission is viewable while signed out");
  await db.collection("submissions").doc(submissionId).set({ mediaStoragePath: rejectedPath, status: "rejected", visibility: "private" }, { merge: true });
  equal((await read(rejectedPath)).status, 404, "rejected/private participant submission is not exposed");
  equal((await read(rejectedPath, submissionOwner.token)).status, 200, "submission owner retains access to their currently referenced rejected asset");
  equal((await read(submissionPath, submissionOwner.token)).status, 404, "replaced, unreferenced submission media is not served through the application route");

  const unsupportedPath = `verified-challenge-media/${publicId}/images/unsupported.png`;
  await object(unsupportedPath, "application/octet-stream");
  await db.collection("challenges").doc(publicId).set({ challengeImages: [{ path: publicCover }, { path: publicGallery }, { path: unsupportedPath }] }, { merge: true });
  equal((await read(unsupportedPath)).status, 415, "unsupported stored content types are rejected");

  console.log(`PASS actual GET /api/challenge-media handler with Auth, Firestore, and Storage Emulators: ${assertions} assertions.`);
} finally {
  await app.delete();
}
