import { loadEnvConfig } from "@next/env";
import { getApps, initializeApp, cert, applicationDefault } from "firebase-admin/app";
import { FieldPath, getFirestore } from "firebase-admin/firestore";

loadEnvConfig(process.cwd());

const args = new Set(process.argv.slice(2));
const projectArg = process.argv.find((arg) => arg.startsWith("--project-id="))?.slice("--project-id=".length);
const projectId = process.env.FIREBASE_PROJECT_ID || process.env.GCLOUD_PROJECT;
if (!projectArg || projectArg !== projectId) {
  console.error("STOP: provide --project-id matching FIREBASE_PROJECT_ID/GCLOUD_PROJECT; no records were changed.");
  process.exit(2);
}
const applying = args.has("--apply");
if (applying && projectId === "challenge-suite" && !args.has("--allow-production")) {
  console.error("STOP: applying to the production project requires an explicit --allow-production flag; no records were changed.");
  process.exit(2);
}

const privateParticipantStatuses = new Set(["registered", "approved", "active", "entered", "enrolled", "winner"]);
const privateVisibility = (challenge) => {
  const visibility = String(challenge.visibility ?? challenge.type ?? "public").toLowerCase();
  const type = String(challenge.type ?? "").toLowerCase();
  return visibility.includes("private") || visibility.includes("exclusive") || visibility.includes("invite")
    || type.includes("private") || type.includes("exclusive") || type.includes("invite");
};

function adminApp() {
  if (getApps().length) return getApps()[0];
  const privateKey = process.env.FIREBASE_PRIVATE_KEY?.trim().replace(/\\n/g, "\n");
  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
  const credential = privateKey && clientEmail
    ? cert({ projectId, clientEmail, privateKey })
    : applicationDefault();
  return initializeApp({ projectId, credential, storageBucket: process.env.FIREBASE_STORAGE_BUCKET });
}

let db;
try {
  db = getFirestore(adminApp());
} catch {
  console.error("STOP: Firebase Admin could not initialize for the explicitly selected project; no records were changed.");
  process.exit(3);
}

async function readAll(collectionName) {
  const docs = [];
  let cursor = null;
  while (true) {
    let query = db.collection(collectionName).orderBy(FieldPath.documentId()).limit(250);
    if (cursor) query = query.startAfter(cursor);
    const page = await query.get();
    docs.push(...page.docs);
    if (page.size < 250) return docs;
    cursor = page.docs.at(-1);
  }
}

async function inChunks(items, size, fn) {
  for (let index = 0; index < items.length; index += size) await fn(items.slice(index, index + size));
}

const [accessDocs, participantDocs, existingAccessDocs, userDocs] = await Promise.all([
  readAll("privateChallengeAccess"),
  readAll("challengeParticipants"),
  readAll("challengeMediaAccess"),
  readAll("users")
]);

const candidates = [];
for (const doc of accessDocs) {
  const data = doc.data();
  if (data.status === "approved" && typeof data.challengeId === "string" && typeof data.userId === "string") {
    candidates.push({ challengeId: data.challengeId, userId: data.userId });
  }
}
for (const doc of participantDocs) {
  const data = doc.data();
  if (privateParticipantStatuses.has(String(data.status ?? "").toLowerCase()) && typeof data.challengeId === "string" && typeof data.userId === "string") {
    candidates.push({ challengeId: data.challengeId, userId: data.userId });
  }
}
for (const doc of existingAccessDocs) {
  const data = doc.data();
  if (typeof data.challengeId === "string" && typeof data.userId === "string") candidates.push({ challengeId: data.challengeId, userId: data.userId });
}

const challengeIds = [...new Set(candidates.map((item) => item.challengeId))];
const challenges = new Map();
await inChunks(challengeIds, 100, async (ids) => {
  const snapshots = await db.getAll(...ids.map((id) => db.collection("challenges").doc(id)));
  snapshots.forEach((snapshot) => challenges.set(snapshot.id, snapshot.exists ? snapshot.data() ?? {} : null));
});

const desiredAccess = new Map();
for (const item of candidates) {
  const challenge = challenges.get(item.challengeId);
  if (challenge && privateVisibility(challenge)) desiredAccess.set(`${item.challengeId}_${item.userId}`, item);
}
const currentAccess = new Map(existingAccessDocs.map((doc) => [doc.id, doc.data()]));
const accessUpdates = [];
for (const [id, item] of desiredAccess) {
  const current = currentAccess.get(id);
  if (current?.privateMediaRead !== true || current?.status !== "active") {
    accessUpdates.push({ ref: db.collection("challengeMediaAccess").doc(id), value: { id, ...item, privateMediaRead: true, status: "active" } });
  }
}
for (const [id, current] of currentAccess) {
  if (!desiredAccess.has(id) && (current.privateMediaRead === true || current.status === "active")) {
    accessUpdates.push({ ref: db.collection("challengeMediaAccess").doc(id), value: { id, challengeId: current.challengeId, userId: current.userId, privateMediaRead: false, status: "revoked" } });
  }
}

const enterpriseUsers = userDocs.flatMap((doc) => {
  const staffAccess = doc.data().staffAccess;
  return staffAccess && typeof staffAccess === "object" && typeof staffAccess.organizationId === "string"
    ? [{ uid: doc.id, organizationId: staffAccess.organizationId, currentStatus: staffAccess.organizationStatus }]
    : [];
});
const organizationIds = [...new Set(enterpriseUsers.map((item) => item.organizationId))];
const organizations = new Map();
await inChunks(organizationIds, 100, async (ids) => {
  const snapshots = await db.getAll(...ids.map((id) => db.collection("enterpriseOrganizations").doc(id)));
  snapshots.forEach((snapshot) => organizations.set(snapshot.id, snapshot.exists ? String(snapshot.data()?.status ?? "missing").toLowerCase() : "missing"));
});
const enterpriseUpdates = enterpriseUsers.flatMap((item) => {
  const status = organizations.get(item.organizationId) ?? "missing";
  if (item.currentStatus === status) return [];
  return [{ ref: db.collection("users").doc(item.uid), organizationStatus: status }];
});
const updates = [...accessUpdates, ...enterpriseUpdates];

if (applying) {
  for (let index = 0; index < updates.length; index += 400) {
    const batch = db.batch();
    for (const update of updates.slice(index, index + 400)) {
      if (update.organizationStatus !== undefined) {
        batch.update(update.ref, new FieldPath("staffAccess", "organizationStatus"), update.organizationStatus);
      } else {
        batch.set(update.ref, update.value, { merge: true });
      }
    }
    await batch.commit();
  }
}

console.log(JSON.stringify({
  projectId,
  mode: applying ? "APPLIED" : "DRY_RUN",
  scanned: {
    privateAccessGrants: accessDocs.length,
    participants: participantDocs.length,
    mediaAccessProjections: existingAccessDocs.length,
    enterpriseUserProfiles: userDocs.length
  },
  plannedProjectionUpdates: accessUpdates.length,
  plannedEnterpriseStatusUpdates: enterpriseUpdates.length,
  appliedUpdates: applying ? updates.length : 0
}));
await db.terminate();
