import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { deleteApp, initializeApp } from "firebase/app";
import { connectAuthEmulator, createUserWithEmailAndPassword, getAuth, signInWithEmailAndPassword, signOut } from "firebase/auth";
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
  const url = new URL(`${firestoreBase}/${collection}/${id}`);
  for (const fieldPath of Object.keys(fields)) url.searchParams.append("updateMask.fieldPaths", fieldPath);
  const response = await fetch(url, {
    method: "PATCH",
    headers: { authorization: "Bearer owner", "content-type": "application/json" },
    body: JSON.stringify({ fields }),
  });
  assert.equal(response.ok, true, `Firestore fixture write failed: ${collection}/${id}: ${response.status} ${await response.text()}`);
}

async function putServerObject(path, contentType, value) {
  const url = new URL(`/v0/b/${encodeURIComponent(bucket)}/o`, `http://${storageEmulator}`);
  url.searchParams.set("uploadType", "media");
  url.searchParams.set("name", path);
  const response = await fetch(url, { method: "POST", headers: { authorization: "Bearer owner", "content-type": contentType }, body: Buffer.from(value) });
  if (!response.ok) assert.fail(`Storage Emulator server fixture write failed: ${response.status} ${await response.text()}`);
  const metadataUrl = new URL(`/v0/b/${encodeURIComponent(bucket)}/o/${encodeURIComponent(path)}`, `http://${storageEmulator}`);
  const metadataResponse = await fetch(metadataUrl, {
    method: "PATCH", headers: { authorization: "Bearer owner", "content-type": "application/json" },
    body: JSON.stringify({ contentType }),
  });
  if (!metadataResponse.ok) assert.fail(`Storage Emulator fixture metadata update failed: ${metadataResponse.status} ${await metadataResponse.text()}`);
  const metadata = await metadataResponse.json();
  assert.equal(metadata.contentType, contentType, `Storage Emulator fixture stored an unexpected content type for ${path}.`);
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
  if (user) await signInWithEmailAndPassword(auth, user.email, user.password);
  else await signOut(auth);
  try { await getBytes(ref(storage, name)); return true; }
  catch (error) {
    if (process.env.DEBUG_STORAGE_RULES === "1") console.error(`Storage read denied for ${name}: ${String(error)}`);
    return false;
  }
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
const orgSuspended = await authUser("org-suspended");
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
const staffAccess = (organizationId, permissions, status = "active", scope = "assigned_only", expiresAt = "2099-01-01T00:00:00.000Z", organizationStatus = "active") => ({
  status: string(status), organizationId: string(organizationId), permissions: array(permissions), scope: string(scope),
  expiresAtTimestamp: expiresAt ? timestamp(expiresAt) : { nullValue: null }, organizationStatus: string(organizationStatus),
});
await putDocument("users", managerA.uid, { staffAccess: { mapValue: { fields: staffAccess(orgA, ["challenge.edit"]) } } });
await putDocument("users", managerB.uid, { staffAccess: { mapValue: { fields: staffAccess(orgB, ["challenge.edit"]) } } });
await putDocument("users", noPermission.uid, { staffAccess: { mapValue: { fields: staffAccess(orgA, ["challenge.view"]) } } });
await putDocument("users", revoked.uid, { staffAccess: { mapValue: { fields: staffAccess(orgA, ["challenge.edit"], "revoked") } } });
await putDocument("users", expired.uid, { staffAccess: { mapValue: { fields: staffAccess(orgA, ["challenge.edit"], "active", "assigned_only", "2000-01-01T00:00:00.000Z") } } });
await putDocument("users", orgSuspended.uid, { staffAccess: { mapValue: { fields: staffAccess(orgA, ["challenge.edit"], "active", "assigned_only", "2099-01-01T00:00:00.000Z", "suspended") } } });

const valid = await writeAsset(managerA, challengeA, "authorized");
assert.equal(valid.response.ok, true, `Authorized manager upload rejected: ${valid.response.status} ${await valid.response.text()}`);

for (const [label, user] of [["foreign organization", managerB], ["missing permission", noPermission], ["revoked membership", revoked], ["expired membership", expired], ["suspended organization projection", orgSuspended], ["unrelated authenticated user", outsider]]) {
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
await putDocument("challengeMediaAccess", `${hiddenPrivateChallenge}_${approvedGuest.uid}`, {
  challengeId: string(hiddenPrivateChallenge), userId: string(approvedGuest.uid), status: string("active"), privateMediaRead: boolean(true),
});
assert.equal(await canReadAsset(approvedGuest, hiddenBanner), true, "Persisted approved private access grant can read protected challenge media.");
await putDocument("privateChallengeAccess", `${hiddenPrivateChallenge}_${approvedGuest.uid}`, {
  challengeId: string(hiddenPrivateChallenge), userId: string(approvedGuest.uid), status: string("revoked"),
});
await putDocument("challengeMediaAccess", `${hiddenPrivateChallenge}_${approvedGuest.uid}`, {
  challengeId: string(hiddenPrivateChallenge), userId: string(approvedGuest.uid), status: string("revoked"), privateMediaRead: boolean(false),
});
assert.equal(await canReadAsset(approvedGuest, hiddenBanner), false, "Revoked private access grant cannot read protected challenge media.");

await putDocument("challengeParticipants", `${hiddenPrivateChallenge}_${participantGuest.uid}`, {
  challengeId: string(hiddenPrivateChallenge), userId: string(participantGuest.uid), status: string("registered"),
});
await putDocument("challengeMediaAccess", `${hiddenPrivateChallenge}_${participantGuest.uid}`, {
  challengeId: string(hiddenPrivateChallenge), userId: string(participantGuest.uid), status: string("active"), privateMediaRead: boolean(true),
});
assert.equal(await canReadAsset(participantGuest, hiddenBanner), true, "Existing registered private participant retains access to protected challenge media.");

const previewChallenge = `private-preview-${randomUUID()}`;
await putDocument("challenges", previewChallenge, {
  creatorId: string(privateOwner.uid), visibility: string("private"), type: string("Private / Exclusive"),
  publicPreviewEnabled: boolean(true), publicVisibility: boolean(true), status: string("registration_open"),
});
const previewBanner = await writePrivateMedia(privateOwner, previewChallenge);
const nonCoverBanner = await writePrivateMedia(privateOwner, previewChallenge);
const protectedTrailer = await writePrivateMedia(privateOwner, previewChallenge, "trailers", "mp4", "video/mp4");
await putDocument("challenges", previewChallenge, { coverImagePath: string(previewBanner) });
assert.equal(await canReadAsset(null, previewBanner), true, "Explicitly discoverable private preview cover is visible to signed-out viewers.");
assert.equal(await canReadAsset(outsider, previewBanner), true, "Explicitly discoverable private preview cover remains visible to signed-in viewers.");
assert.equal(await canReadAsset(null, nonCoverBanner), false, "Signed-out visitors cannot read a non-cover image from a discoverable private challenge.");
assert.equal(await canReadAsset(outsider, nonCoverBanner), false, "Signed-in visitors cannot read a non-cover image from a discoverable private challenge.");
assert.equal(await canReadAsset(outsider, protectedTrailer), false, "Locked preview does not expose protected trailer media.");
assert.equal(await canReadAsset(null, protectedTrailer), false, "Signed-out visitors cannot read a locked private trailer.");

const enterprisePrivateChallenge = `enterprise-private-${randomUUID()}`;
await putDocument("challenges", enterprisePrivateChallenge, {
  officialChallenge: boolean(true), organizationOwnerId: string(orgA), enterpriseAssignedUserIds: array([managerA.uid]),
  creatorId: string(privateOwner.uid), visibility: string("private"), type: string("Private / Exclusive"), status: string("registration_open"),
  publicPreviewEnabled: boolean(false),
});
const enterprisePrivateBanner = await writeAsset(managerA, enterprisePrivateChallenge, "enterprise-private");
assert.equal(enterprisePrivateBanner.response.ok, true, "Authorized Enterprise manager can upload official Private Challenge media.");
assert.equal(await canReadAsset(managerA, enterprisePrivateBanner.name), false, "Private official media is served through the authenticated application route to keep Storage Rules within the two-document access limit.");
assert.equal(await canReadAsset(outsider, enterprisePrivateBanner.name), false, "Unaffiliated viewer cannot read official Private Challenge media.");

const disabledPreviewChallenge = `private-preview-disabled-${randomUUID()}`;
await putDocument("challenges", disabledPreviewChallenge, {
  creatorId: string(privateOwner.uid), visibility: string("private"), type: string("Private / Exclusive"),
  publicPreviewEnabled: boolean(true), publicVisibility: boolean(false), status: string("registration_open"),
});
const disabledPreviewBanner = await writePrivateMedia(privateOwner, disabledPreviewChallenge);
assert.equal(await canReadAsset(outsider, disabledPreviewBanner), false, "Creator-disabled public discoverability keeps private preview media protected.");

const publicChallenge = `public-media-${randomUUID()}`;
await putDocument("challenges", publicChallenge, {
  creatorId: string(privateOwner.uid), visibility: string("public"), status: string("published"), publicVisibility: boolean(true),
});
const publicBanner = await writePrivateMedia(privateOwner, publicChallenge);
await putDocument("challenges", publicChallenge, { coverImagePath: string(publicBanner) });
assert.equal(await canReadAsset(null, publicBanner), true, "A referenced, published public Challenge banner is viewable without authentication.");
const unreferencedBanner = await writePrivateMedia(privateOwner, publicChallenge);
assert.equal(await canReadAsset(null, unreferencedBanner), false, "Other files in a public Challenge banner folder are not blanket-readable.");

const verifiedPublicChallenge = `verified-public-${randomUUID()}`;
const verifiedCover = `verified-challenge-media/${verifiedPublicChallenge}/images/cover.png`;
const verifiedGallery = `verified-challenge-media/${verifiedPublicChallenge}/images/gallery.png`;
const unlistedGallery = `verified-challenge-media/${verifiedPublicChallenge}/images/unlisted.png`;
await putServerObject(verifiedCover, "image/png", "public-cover");
await putServerObject(verifiedGallery, "image/png", "public-gallery");
await putServerObject(unlistedGallery, "image/png", "unlisted-gallery");
await putDocument("challenges", verifiedPublicChallenge, {
  visibility: string("public"), status: string("published"), coverImagePath: string(verifiedCover), publicMediaPaths: array([verifiedCover, verifiedGallery]),
});
assert.equal(await canReadAsset(null, verifiedCover), true, "Signed-out visitors can read the exact verified public cover.");
assert.equal(await canReadAsset(null, verifiedGallery), true, "Signed-out visitors can read an exact server-recorded public gallery path.");
assert.equal(await canReadAsset(null, unlistedGallery), false, "Unreferenced verified objects remain private even in a public Challenge namespace.");

const privateVerifiedChallenge = `verified-private-${randomUUID()}`;
const privateCover = `verified-challenge-media/${privateVerifiedChallenge}/images/cover.png`;
const privateGallery = `verified-challenge-media/${privateVerifiedChallenge}/images/gallery.png`;
await putServerObject(privateCover, "image/png", "private-cover");
await putServerObject(privateGallery, "image/png", "private-gallery");
await putDocument("challenges", privateVerifiedChallenge, {
  creatorId: string(privateOwner.uid), visibility: string("private"), type: string("Private / Exclusive"), status: string("registration_open"),
  publicPreviewEnabled: boolean(true), publicVisibility: boolean(true), coverImagePath: string(privateCover), publicMediaPaths: array([privateCover, privateGallery]),
});
assert.equal(await canReadAsset(null, privateCover), true, "Private preview exposes only the referenced cover to signed-out visitors.");
assert.equal(await canReadAsset(null, privateGallery), false, "Private gallery remains protected even if present in the public-media projection.");

await signInWithEmailAndPassword(auth, managerA.email, managerA.password);
const concurrentUploads = await Promise.all(["parallel-a", "parallel-b", "parallel-c"].map(async (suffix) => {
  const name = `challenges/${challengeA}/banner/${suffix}-${randomUUID()}.png`;
  try {
    await uploadBytes(ref(storage, name), new Blob([suffix], { type: "image/png" }), { contentType: "image/png" });
    return true;
  } catch { return false; }
}));
assert.deepEqual(concurrentUploads, [true, true, true], "Repeated concurrent uploads by the authorized Enterprise manager succeed without widening the rule.");
const retriedUpload = await writeAsset(managerA, challengeA, "retry-after-prior-success");
assert.equal(retriedUpload.response.ok, true, "A later independent upload by the authorized Enterprise manager remains allowed.");

console.log("PASS Firebase Storage emulator: Enterprise permissions, owner/grant/participant privacy, signed-out public media, exact path visibility, locked previews, protected trailer, repeated uploads, and concurrent uploads");
await deleteApp(app);
