import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import sharp from "sharp";
import { initializeApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import { getStorage } from "firebase-admin/storage";
import { TOURNAMENT_PRODUCT_POLICY } from "../lib/tournament-builder-policy.ts";
import { freezeTournamentBuilderMedia, verifyTournamentBuilderMedia } from "../lib/server/tournament-media-verification.ts";
assert.match(process.env.GCLOUD_PROJECT ?? "", /^demo-/);
for (const name of ["FIRESTORE_EMULATOR_HOST", "FIREBASE_AUTH_EMULATOR_HOST", "FIREBASE_STORAGE_EMULATOR_HOST"]) assert.match(process.env[name] ?? "", /^127\.0\.0\.1:\d+$/);
const app = initializeApp({ projectId: process.env.GCLOUD_PROJECT, storageBucket: `${process.env.GCLOUD_PROJECT}.appspot.com` });
const db = getFirestore(app), bucket = getStorage(app).bucket();
const { POST: submit } = await import("../app/api/tournaments/[id]/submissions/route.ts");
const { GET: media } = await import("../app/api/tournaments/[id]/submissions/[submissionId]/media/route.ts");
const { POST: adminAction } = await import("../app/api/admin/tournaments/[id]/route.ts");
const { GET: promotionalMedia } = await import("../app/api/tournaments/[id]/media/[asset]/route.ts");
const id = `submission_${randomUUID()}`;
let assertions = 0;
const equal = (actual, expected) => { assert.equal(actual, expected); assertions++; };
async function user(label, admin = false) {
  const response = await fetch(`http://${process.env.FIREBASE_AUTH_EMULATOR_HOST}/identitytoolkit.googleapis.com/v1/accounts:signUp?key=local`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ email: `${label}-${id}@example.test`, password: "EmulatorOnly123!", returnSecureToken: true }) });
  const record = await response.json(); assert.ok(record.idToken);
  await db.collection("users").doc(record.localId).set({ role: admin ? "admin" : "creator", isAdmin: admin, emailVerified: true });
  return { uid: record.localId, token: record.idToken };
}
const owner = await user("owner"), stranger = await user("stranger"), admin = await user("admin", true);
const participantId = `${id}_${owner.uid}`, matchId = `${id}_match`, roundId = `${id}_round`, submissionId = `${id}_${matchId}_${participantId}`;
function request(token, body) { return new Request("http://localhost/api/local-test", { method: "POST", headers: { "content-type": "application/json", ...(token ? { authorization: `Bearer ${token}` } : {}) }, body: JSON.stringify(body) }); }
const context = { params: Promise.resolve({ id }) };
const mediaContext = { params: Promise.resolve({ id, submissionId }) };
async function image(name, color = "red") {
  const path = `tournaments/${id}/rounds/${roundId}/matches/${matchId}/participants/${participantId}/images/${name}.png`;
  const bytes = await sharp({ create: { width: 8, height: 8, channels: 3, background: color } }).png().toBuffer();
  await bucket.file(path).save(bytes, { metadata: { contentType: "image/png" } });
  return { mediaPath: path, mediaUrl: `https://firebasestorage.googleapis.com/v0/b/${bucket.name}/o/${encodeURIComponent(path)}?alt=media`, mediaType: "image", matchId, roundId };
}
try {
  await db.collection("tournaments").doc(id).set({ id, productPolicyVersion: TOURNAMENT_PRODUCT_POLICY, configVersion: 3, hostId: admin.uid, privacy: "public", status: "round_active", participationMode: "individual", submissionMediaTypes: ["image"], resultMethod: "votes" });
  await db.collection("tournamentParticipants").doc(participantId).set({ tournamentId: id, userId: owner.uid, status: "active" });
  await db.collection("tournamentRounds").doc(roundId).set({ tournamentId: id, status: "active" });
  await db.collection("tournamentMatches").doc(matchId).set({ tournamentId: id, roundId, status: "submissions_open", participantAId: participantId, participantBId: "opponent", submissionsOpenedAt: new Date(Date.now() - 1000).toISOString(), submissionDeadlineAt: new Date(Date.now() + 60000).toISOString() });
  const promotionalPath = `tournaments/drafts/${owner.uid}/cover/verified.png`;
  const promotionalBytes = await sharp({ create: { width: 16, height: 12, channels: 3, background: "gold" } }).png().toBuffer();
  await bucket.file(promotionalPath).save(promotionalBytes, { metadata: { contentType: "image/png" } });
  const verifiedPromotion = await freezeTournamentBuilderMedia(id, await verifyTournamentBuilderMedia({ coverImagePath: promotionalPath }, owner.uid));
  await db.collection("tournaments").doc(id).update({ creatorMediaVerification: verifiedPromotion });
  const promotionalContext = { params: Promise.resolve({ id, asset: verifiedPromotion.cover.sha256 }) };
  equal((await promotionalMedia(new Request("http://localhost/promotion"), promotionalContext)).status, 200);
  await bucket.file(promotionalPath).save(Buffer.from("mutated after review"), { metadata: { contentType: "image/png" } });
  const preservedPromotion = await promotionalMedia(new Request("http://localhost/promotion"), promotionalContext);
  assert.deepEqual(Buffer.from(await preservedPromotion.arrayBuffer()), promotionalBytes); assertions++;
  await db.collection("tournaments").doc(id).update({ status: "draft" });
  equal((await promotionalMedia(new Request("http://localhost/promotion"), promotionalContext)).status, 404);
  await db.collection("tournaments").doc(id).update({ status: "round_active" });
  const first = await image("first");
  equal((await submit(request(stranger.token, first), context)).status, 403);
  equal((await submit(request(owner.token, first), context)).status, 200);
  equal((await media(new Request("http://localhost/media"), mediaContext)).status, 404);
  equal((await media(new Request("http://localhost/media", { headers: { authorization: `Bearer ${owner.token}` } }), mediaContext)).status, 200);
  equal((await adminAction(request(admin.token, { action: "submission_approved", submissionId, reason: "Verified original image" }), context)).status, 422);
  equal((await adminAction(request(admin.token, { action: "submission_approved", submissionId, reason: "Verified original image", confirmed: true }), context)).status, 200);
  const approved = await media(new Request("http://localhost/media"), mediaContext);
  equal(approved.status, 200);
  const originalBytes = Buffer.from(await approved.arrayBuffer());
  await bucket.file(first.mediaPath).save(Buffer.from("changed source"), { metadata: { contentType: "image/png" } });
  const stable = await media(new Request("http://localhost/media"), mediaContext);
  assert.deepEqual(Buffer.from(await stable.arrayBuffer()), originalBytes); assertions++;
  const replacement = await image("replacement", "blue");
  const competing = await image("competing", "green");
  const responses = await Promise.all([submit(request(owner.token, { ...replacement, expectedRevision: 1 }), context), submit(request(owner.token, { ...competing, expectedRevision: 1 }), context)]);
  assert.deepEqual(responses.map(response => response.status).sort(), [200, 409]); assertions++;
  equal((await db.collection("tournamentSubmissionRevisions").where("submissionId", "==", submissionId).get()).size, 1);
  equal((await media(new Request("http://localhost/media"), mediaContext)).status, 404);
  await db.collection("tournamentMatches").doc(matchId).update({ submissionDeadlineAt: new Date(Date.now() - 1).toISOString() });
  equal((await submit(request(owner.token, { ...replacement, expectedRevision: 2 }), context)).status, 400);
  equal((await adminAction(request(admin.token, { action: "resolve_dispute", reason: "Unsupported arbitrary action", confirmed: true }), context)).status, 409);
  console.log(`Tournament submission and media handlers: ${assertions} emulator assertions passed, including immutable reviewed content, confirmation, concurrent revisions and privacy.`);
} finally { await db.terminate(); }
