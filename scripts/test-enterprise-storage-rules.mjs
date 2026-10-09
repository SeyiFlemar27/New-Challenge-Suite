import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { deleteApp, initializeApp } from "firebase/app";
import { connectAuthEmulator, createUserWithEmailAndPassword, signInWithEmailAndPassword, getAuth } from "firebase/auth";
import { connectStorageEmulator, deleteObject, getStorage, ref, uploadBytes } from "firebase/storage";

const projectId = "demo-challenge-suite";
const authBase = "http://127.0.0.1:9099";
const firestoreBase = `http://127.0.0.1:8080/v1/projects/${projectId}/databases/(default)/documents`;
const bucket = `${projectId}.appspot.com`;
const app = initializeApp({ apiKey: "fake-api-key", authDomain: `${projectId}.firebaseapp.com`, projectId, storageBucket: bucket }, `enterprise-storage-${randomUUID()}`);
const auth = getAuth(app);
connectAuthEmulator(auth, authBase, { disableWarnings: true });
const storage = getStorage(app);
connectStorageEmulator(storage, "127.0.0.1", 9199);

function string(value) { return { stringValue: value }; }
function array(values) { return { arrayValue: { values: values.map(string) } }; }
function timestamp(value) { return { timestampValue: value }; }

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

console.log("PASS Firebase Storage emulator: authorized manager and cross-organization, permission, revoked, expired, outsider, replacement, deletion, and client-scope cases");
await deleteApp(app);
