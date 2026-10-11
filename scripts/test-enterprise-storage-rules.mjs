import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { deleteApp, initializeApp } from "firebase/app";
import { connectAuthEmulator, createUserWithEmailAndPassword, signInWithEmailAndPassword, getAuth } from "firebase/auth";
import { connectStorageEmulator, deleteObject, getBytes, getStorage, ref, uploadBytes } from "firebase/storage";

const projectId = process.env.CHALLENGE_SUITE_E2E_PROJECT_ID ?? process.env.GCLOUD_PROJECT ?? process.env.FIREBASE_PROJECT_ID ?? "demo-challenge-suite";
assert.ok(projectId.startsWith("demo-"), "Storage Rules tests require an isolated demo-* Firebase project ID.");
const authEmulator = process.env.FIREBASE_AUTH_EMULATOR_HOST ?? "127.0.0.1:9099";
const firestoreEmulator = process.env.FIRESTORE_EMULATOR_HOST ?? "127.0.0.1:8080";
const storageEmulator = process.env.FIREBASE_STORAGE_EMULATOR_HOST ?? "127.0.0.1:9199";
const authBase = `http://${authEmulator}`;
const firestoreBase = `http://${firestoreEmulator}/v1/projects/${projectId}/databases/(default)/documents`;
const bucket = `${projectId}.appspot.com`;
const app = initializeApp({ apiKey: "fake-api-key", authDomain: `${projectId}.firebaseapp.com`, projectId, storageBucket: bucket }, `enterprise-storage-${randomUUID()}`);
const auth = getAuth(app);
connectAuthEmulator(auth, authBase, { disableWarnings: true });
const storage = getStorage(app);
const storageUrl = new URL(`http://${storageEmulator}`);
connectStorageEmulator(storage, storageUrl.hostname, Number(storageUrl.port || 80));

function string(value) { return { stringValue: value }; }
function array(values) { return { arrayValue: { values: values.map(string) } }; }
function timestamp(value) { return { timestampValue: value }; }
function boolean(value) { return { booleanValue: value }; }

async function authUser(label) {
  const email = `${label}-${randomUUID()}@example.test`;
  const password = "TestPassword123!";
  const credential = await createUserWithEmailAndPassword(auth, email, password);
  return { uid: credential.user.uid, email, password };
}

async function putDocument(collection, id, fields) {
  const response = await fetch(`${firestoreBase}/${collection}/${id}`, {
    method: "PATCH",
    headers: { authorization: "Bearer owner", "content-type": "application/json" },
    body: JSON.stringify({ fields }),
  });
  assert.equal(response.ok, true, `Firestore fixture write failed: ${collection}/${id}: ${response.status} ${await response.text()}`);
}

async function writeAsset(token, challengeId, suffix = "first", customMetadata = {}) {
  const name = `challenges/${challengeId}/banner/${suffix}-${randomUUID()}.png`;
  await signInWithEmailAndPassword(auth, token.email, token.password);
  try {
    await uploadBytes(ref(storage, name), new Blob(["emulator-storage-rules-fixture"], { type: "image/png" }), { contentType: "image/png", customMetadata });
    return { response: { ok: true, status: 200, text: async () => "" }, name };
  } catch (error) {
    return { response: { ok: false, status: 403, text: async () => String(error) }, name };
  }
}

async function writePrivateMedia(user, challengeId, folder = "banner", extension = "png", contentType = "image/png") {
  const name = `challenges/${challengeId}/${folder}/${randomUUID()}.${extension}`;
  await signInWithEmailAndPassword(auth, user.email, user.password);
  await uploadBytes(ref(storage, name), new Blob(["private-media-fixture"], { type: contentType }), { contentType });
  return name;
}

async function canReadAsset(user, name) {
  await signInWithEmailAndPassword(auth, user.email, user.password);
  try { await getBytes(ref(storage, name)); return true; }
  catch { return false; }
}

async function deleteAsset(token, name) {
  await signInWithEmailAndPassword(auth, token.email, token.password);
  try { await deleteObject(ref(storage, name)); return { status: 200 }; }
  catch { return { status: 403 }; }
}

const orgA = `org-a-${randomUUID()}`;
const orgB = `org-b-${randomUUID()}`;
const challengeA = `challenge-a-${randomUUID()}`;
const challengeB = `challenge-b-${randomUUID()}`;
const managerA = await authUser("manager-a");
const managerB = await authUser("manager-b");
const noPermission = await authUser("no-permission");
const revoked = await authUser("revoked");
const expired = await authUser("expired");
const outsider = await authUser("outsider");
const privateOwner = await authUser("private-owner");
const approvedGuest = await authUser("approved-guest");
const participantGuest = await authUser("participant-guest");

await putDocument("enterpriseOrganizations", orgA, { status: string("active") });
await putDocument("enterpriseOrganizations", orgB, { status: string("active") });
await putDocument("challenges", challengeA, {
  officialChallenge: { booleanValue: true }, organizationOwnerId: string(orgA), enterpriseAssignedUserIds: array([managerA.uid]),
});
await putDocument("challenges", challengeB, {
  officialChallenge: { booleanValue: true }, organizationOwnerId: string(orgB), enterpriseAssignedUserIds: array([managerB.uid]),
});
const staffAccess = (organizationId, permissions, status = "active", scope = "assigned_only", expiresAt = "2099-01-01T00:00:00.000Z") => ({
  status: string(status), organizationId: string(organizationId), permissions: array(permissions), scope: string(scope),
  expiresAtTimestamp: expiresAt ? timestamp(expiresAt) : { nullValue: null },
});
await putDocument("users", managerA.uid, { staffAccess: { mapValue: { fields: staffAccess(orgA, ["challenge.edit"]) } } });
await putDocument("users", managerB.uid, { staffAccess: { mapValue: { fields: staffAccess(orgB, ["challenge.edit"]) } } });
await putDocument("users", noPermission.uid, { staffAccess: { mapValue: { fields: staffAccess(orgA, ["challenge.view"]) } } });
await putDocument("users", revoked.uid, { staffAccess: { mapValue: { fields: staffAccess(orgA, ["challenge.edit"], "revoked") } } });
await putDocument("users", expired.uid, { staffAccess: { mapValue: { fields: staffAccess(orgA, ["challenge.edit"], "active", "assigned_only", "2000-01-01T00:00:00.000Z") } } });

const valid = await writeAsset(managerA, challengeA, "authorized");
assert.equal(valid.response.ok, true, `Authorized manager upload rejected: ${valid.response.status} ${await valid.response.text()}`);

for (const [label, user] of [["foreign organization", managerB], ["missing permission", noPermission], ["revoked membership", revoked], ["expired membership", expired], ["unrelated authenticated user", outsider]]) {
  const attempt = await writeAsset(user, challengeA, label.replaceAll(" ", "-"));
  assert.equal(attempt.response.status, 403, `${label} upload was not denied: ${attempt.response.status}`);
}

const crossOrganization = await writeAsset(managerA, challengeB, "cross-organization");
assert.equal(crossOrganization.response.status, 403, `Cross-organization upload was not denied: ${crossOrganization.response.status}`);
const foreignAsset = await writeAsset(managerB, challengeB, "owned-by-b");
assert.equal(foreignAsset.response.ok, true, `Organization B manager could not create its asset: ${foreignAsset.response.status}`);
await signInWithEmailAndPassword(auth, managerA.email, managerA.password);
let overwriteDenied = false;
try { await uploadBytes(ref(storage, foreignAsset.name), new Blob(["replacement"], { type: "image/png" }), { contentType: "image/png" }); }
catch { overwriteDenied = true; }
assert.equal(overwriteDenied, true, "Cross-organization replacement was not denied.");
const deletion = await deleteAsset(managerA, foreignAsset.name);
assert.equal(deletion.status, 403, `Cross-organization deletion was not denied: ${deletion.status}`);

const clientScopeSpoof = await writeAsset(managerA, challengeA, `${orgB}-spoof`, { organizationId: orgB });
assert.equal(clientScopeSpoof.response.ok, true, "Client metadata should not override server-derived ownership for an authorized challenge asset.");

const hiddenPrivateChallenge = `private-hidden-${randomUUID()}`;
await putDocument("challenges", hiddenPrivateChallenge, {
  creatorId: string(privateOwner.uid), visibility: string("private"), type: string("Private / Exclusive"),
  publicPreviewEnabled: boolean(false), status: string("registration_open"),
});
const hiddenBanner = await writePrivateMedia(privateOwner, hiddenPrivateChallenge);
assert.equal(await canReadAsset(privateOwner, hiddenBanner), true, "Private challenge owner can read protected challenge banner media.");
assert.equal(await canReadAsset(outsider, hiddenBanner), false, "Unrelated signed-in user cannot read a non-discoverable private challenge banner by guessing its path.");

await putDocument("privateChallengeAccess", `${hiddenPrivateChallenge}_${approvedGuest.uid}`, {
  challengeId: string(hiddenPrivateChallenge), userId: string(approvedGuest.uid), status: string("approved"),
});
assert.equal(await canReadAsset(approvedGuest, hiddenBanner), true, "Persisted approved private access grant can read protected challenge media.");
await putDocument("privateChallengeAccess", `${hiddenPrivateChallenge}_${approvedGuest.uid}`, {
  challengeId: string(hiddenPrivateChallenge), userId: string(approvedGuest.uid), status: string("revoked"),
});
assert.equal(await canReadAsset(approvedGuest, hiddenBanner), false, "Revoked private access grant cannot read protected challenge media.");

await putDocument("challengeParticipants", `${hiddenPrivateChallenge}_${participantGuest.uid}`, {
  challengeId: string(hiddenPrivateChallenge), userId: string(participantGuest.uid), status: string("registered"),
});
assert.equal(await canReadAsset(participantGuest, hiddenBanner), true, "Existing registered private participant retains access to protected challenge media.");

const previewChallenge = `private-preview-${randomUUID()}`;
await putDocument("challenges", previewChallenge, {
  creatorId: string(privateOwner.uid), visibility: string("private"), type: string("Private / Exclusive"),
  publicPreviewEnabled: boolean(true), publicVisibility: boolean(true), status: string("registration_open"),
});
const previewBanner = await writePrivateMedia(privateOwner, previewChallenge);
const protectedTrailer = await writePrivateMedia(privateOwner, previewChallenge, "trailers", "mp4", "video/mp4");
assert.equal(await canReadAsset(outsider, previewBanner), true, "Explicitly discoverable private preview banner remains visible to signed-in viewers.");
assert.equal(await canReadAsset(outsider, protectedTrailer), false, "Locked preview does not expose protected trailer media.");

const disabledPreviewChallenge = `private-preview-disabled-${randomUUID()}`;
await putDocument("challenges", disabledPreviewChallenge, {
  creatorId: string(privateOwner.uid), visibility: string("private"), type: string("Private / Exclusive"),
  publicPreviewEnabled: boolean(true), publicVisibility: boolean(false), status: string("registration_open"),
});
const disabledPreviewBanner = await writePrivateMedia(privateOwner, disabledPreviewChallenge);
assert.equal(await canReadAsset(outsider, disabledPreviewBanner), false, "Creator-disabled public discoverability keeps private preview media protected.");

console.log("PASS Firebase Storage emulator: Enterprise permissions and private challenge owner, grant, participant, discoverable preview, protected trailer, and disabled preview cases");
await deleteApp(app);
