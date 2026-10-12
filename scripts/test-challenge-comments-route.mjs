import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore } from "firebase-admin/firestore";

assert.ok(process.env.FIRESTORE_EMULATOR_HOST, "FIRESTORE_EMULATOR_HOST is required");
assert.ok(process.env.FIREBASE_AUTH_EMULATOR_HOST, "FIREBASE_AUTH_EMULATOR_HOST is required");
const app = initializeApp({ projectId: process.env.FIREBASE_PROJECT_ID ?? "demo-challenge-suite" });
const db = getFirestore(app);
const auth = getAuth(app);
const { GET, POST, DELETE } = await import("../app/api/challenges/[id]/comments/route.ts");
const prefix = `comments_${randomUUID().replaceAll("-", "")}`;
let assertions = 0;
const createdUsers = [];

function check(value, message) { assert.ok(value, message); assertions += 1; }
function equal(actual, expected, message) { assert.equal(actual, expected, message); assertions += 1; }
function req(url, token, method = "GET", body) {
  return new Request(url, { method, headers: { ...(token ? { authorization: `Bearer ${token}` } : {}), ...(body ? { "content-type": "application/json" } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}) });
}
async function user(label, profile = {}) {
  const email = `${prefix}_${label}@example.test`;
  const signUp = await fetch(`http://${process.env.FIREBASE_AUTH_EMULATOR_HOST}/identitytoolkit.googleapis.com/v1/accounts:signUp?key=fake-api-key`, {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ email, password: "TestPassword123!", returnSecureToken: true })
  });
  const data = await signUp.json();
  assert.equal(signUp.ok, true, JSON.stringify(data));
  await Promise.all([
    db.collection("users").doc(data.localId).set({ email, emailVerified: true, role: "user", accountStatus: "active" }),
    db.collection("profiles").doc(data.localId).set({ username: label, displayName: label, planId: "free", accountType: "user", publicProfile: true, ...profile })
  ]);
  const created = { uid: data.localId, token: data.idToken };
  createdUsers.push(created);
  return created;
}

try {
  const author = await user("comment_author");
  const privateProfileAuthor = await user("private_author", { publicProfile: false, profileVisibility: "private", avatarUrl: "https://example.test/private-avatar.png" });
  const owner = await user("comment_owner");
  const granted = await user("comment_granted");
  const outsider = await user("comment_outsider");
  const publicChallengeId = `${prefix}_public`;
  await db.collection("challenges").doc(publicChallengeId).set({ id: publicChallengeId, creatorId: owner.uid, title: "Public comments", visibility: "public", type: "Normal Challenge", status: "active", lifecycleStatus: "active", createdAt: new Date().toISOString() });
  const comments = db.collection("challengeComments");
  for (let index = 0; index < 45; index += 1) {
    const ref = comments.doc(`${prefix}_comment_${String(index).padStart(3, "0")}`);
    await ref.set({ id: ref.id, challengeId: publicChallengeId, userId: index === 43 ? privateProfileAuthor.uid : author.uid, username: index === 43 ? "private_author" : "comment_author", avatarUrl: index === 43 ? "https://example.test/private-avatar.png" : null, body: `Comment ${index}`, status: index === 44 ? "removed" : "active", createdAt: new Date(Date.UTC(2026, 0, 1, 0, index)).toISOString() });
  }

  const first = await GET(req(`http://localhost/api/challenges/${publicChallengeId}/comments?pageSize=20`), { params: Promise.resolve({ id: publicChallengeId }) });
  equal(first.status, 200, "public challenge comment page is readable");
  const firstBody = await first.json();
  equal(firstBody.data.comments.length, 20, "page size is applied to visible comments");
  equal(firstBody.data.pagination.total, 44, "total excludes moderated or removed comments");
  equal(firstBody.data.pagination.hasMore, true, "first page advertises continuation");
  const privateComment = firstBody.data.comments.find((comment) => comment.username === null);
  if (privateComment) {
    equal(privateComment.avatarUrl, null, "private profile avatar is not exposed through comments");
    check(!("userId" in privateComment), "comment payload does not expose internal user IDs");
  }
  const second = await GET(req(`http://localhost/api/challenges/${publicChallengeId}/comments?pageSize=20&cursor=${encodeURIComponent(firstBody.data.pagination.nextCursor)}`), { params: Promise.resolve({ id: publicChallengeId }) });
  equal(second.status, 200, "cursor page loads");
  const secondBody = await second.json();
  equal(secondBody.data.comments.length, 20, "second page has the expected size");
  check(!firstBody.data.comments.some((item) => secondBody.data.comments.some((other) => other.id === item.id)), "cursor pages contain no duplicate comment IDs");
  const third = await GET(req(`http://localhost/api/challenges/${publicChallengeId}/comments?pageSize=20&cursor=${encodeURIComponent(secondBody.data.pagination.nextCursor)}`), { params: Promise.resolve({ id: publicChallengeId }) });
  const thirdBody = await third.json();
  equal(thirdBody.data.comments.length, 4, "last page contains remaining visible comments");
  equal(thirdBody.data.pagination.hasMore, false, "last page has no continuation");

  const posted = await POST(req(`http://localhost/api/challenges/${publicChallengeId}/comments`, author.token, "POST", { body: "A new eligible comment" }), { params: Promise.resolve({ id: publicChallengeId }) });
  equal(posted.status, 200, "authorized signed-in viewer can comment without participating");
  const postedData = (await posted.json()).data.comment;
  check(typeof postedData.username === "string" && !("displayName" in postedData) && !("verified" in postedData), "new comment stores public username without full-name or verification identity");
  const afterPost = await GET(req(`http://localhost/api/challenges/${publicChallengeId}/comments?pageSize=20`), { params: Promise.resolve({ id: publicChallengeId }) });
  equal((await afterPost.json()).data.pagination.total, 45, "authoritative total includes the newly posted comment");

  const privateChallengeId = `${prefix}_private`;
  await db.collection("challenges").doc(privateChallengeId).set({ id: privateChallengeId, creatorId: owner.uid, title: "Private comments", visibility: "private", type: "Private / Exclusive", status: "active", lifecycleStatus: "active", privateVotingAccess: "public_voting", privateJoiningPolicy: "invite_only", createdAt: new Date().toISOString() });
  await db.collection("privateChallengeAccess").doc(`${privateChallengeId}_${granted.uid}`).set({ id: `${privateChallengeId}_${granted.uid}`, challengeId: privateChallengeId, userId: granted.uid, status: "approved", source: "invite_link" });
  equal((await GET(req(`http://localhost/api/challenges/${privateChallengeId}/comments`), { params: Promise.resolve({ id: privateChallengeId }) })).status, 404, "guest cannot read private challenge comments");
  equal((await GET(req(`http://localhost/api/challenges/${privateChallengeId}/comments`, outsider.token), { params: Promise.resolve({ id: privateChallengeId }) })).status, 404, "public voting configuration does not grant private comments to an outsider");
  equal((await POST(req(`http://localhost/api/challenges/${privateChallengeId}/comments`, outsider.token, "POST", { body: "Attempted private comment" }), { params: Promise.resolve({ id: privateChallengeId }) })).status, 404, "outsider cannot post private challenge comments");
  equal((await GET(req(`http://localhost/api/challenges/${privateChallengeId}/comments`, granted.token), { params: Promise.resolve({ id: privateChallengeId }) })).status, 200, "approved access grant can read private comments");

  const completionId = `${prefix}_complete`;
  await db.collection("challenges").doc(completionId).set({ id: completionId, creatorId: owner.uid, visibility: "public", type: "Normal Challenge", status: "completed", lifecycleStatus: "completed", createdAt: new Date().toISOString() });
  equal((await POST(req(`http://localhost/api/challenges/${completionId}/comments`, author.token, "POST", { body: "Too late" }), { params: Promise.resolve({ id: completionId }) })).status, 409, "completed challenge rejects new comments");
  equal((await GET(req(`http://localhost/api/challenges/${completionId}/comments`), { params: Promise.resolve({ id: completionId }) })).status, 200, "completed challenge comments remain readable");

  console.log(`challenge comments route emulator tests passed (${assertions} assertions)`);
} finally {
  await db.recursiveDelete(db.collection("challenges").doc(`${prefix}_public`)).catch(() => undefined);
  await db.recursiveDelete(db.collection("challenges").doc(`${prefix}_private`)).catch(() => undefined);
  await db.recursiveDelete(db.collection("challenges").doc(`${prefix}_complete`)).catch(() => undefined);
  const own = await db.collection("challengeComments").where("challengeId", "in", [`${prefix}_public`, `${prefix}_private`, `${prefix}_complete`]).get().catch(() => null);
  if (own) await Promise.all(own.docs.map((doc) => doc.ref.delete()));
  await db.collection("privateChallengeAccess").doc(`${prefix}_private_${createdUsers[3]?.uid}`).delete().catch(() => undefined);
  await Promise.all(createdUsers.map(async (created) => {
    await Promise.all([db.collection("users").doc(created.uid).delete(), db.collection("profiles").doc(created.uid).delete(), auth.deleteUser(created.uid).catch(() => undefined)]);
  }));
  await app.delete();
}
