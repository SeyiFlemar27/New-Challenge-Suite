import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore } from "firebase-admin/firestore";
import { challengeMediaDeliveryUrl } from "../lib/server/challenge-media-delivery.ts";

assert.ok(process.env.FIRESTORE_EMULATOR_HOST, "FIRESTORE_EMULATOR_HOST is required");
assert.ok(process.env.FIREBASE_AUTH_EMULATOR_HOST, "FIREBASE_AUTH_EMULATOR_HOST is required");
const app = initializeApp({ projectId: process.env.FIREBASE_PROJECT_ID ?? "demo-challenge-suite" });
const db = getFirestore(app);
const auth = getAuth(app);
const { GET: participantsGet } = await import("../app/api/challenges/[id]/participants/route.ts");
const { GET: detailGet } = await import("../app/api/challenges/[id]/route.ts");
const { GET: commentsGet } = await import("../app/api/challenges/[id]/comments/route.ts");
const { GET: leaderboardGet } = await import("../app/api/leaderboards/route.ts");
const { POST: votePost } = await import("../app/api/votes/route.ts");
const prefix = `leaderboard_${randomUUID().replaceAll("-", "")}`;
const publicId = `${prefix}_public`;
const privateId = `${prefix}_private`;
const mediaPath = `challenges/${privateId}/submissions/private-user/images/entry.png`;
let checks = 0;
let token = "";
let viewerId = "";

function check(value, message) { assert.ok(value, message); checks += 1; }
function equal(actual, expected, message) { assert.equal(actual, expected, message); checks += 1; }
function request(url, authToken = token, method = "GET", body) {
  return new Request(url, {
    method,
    headers: { ...(authToken ? { authorization: `Bearer ${authToken}` } : {}), ...(body ? { "content-type": "application/json" } : {}) },
    ...(body ? { body: JSON.stringify(body) } : {})
  });
}
const routeParams = (id) => ({ params: Promise.resolve({ id }) });

try {
  const email = `${prefix}@example.test`;
  const signup = await fetch(`http://${process.env.FIREBASE_AUTH_EMULATOR_HOST}/identitytoolkit.googleapis.com/v1/accounts:signUp?key=fake-api-key`, {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ email, password: "TestPassword123!", returnSecureToken: true })
  });
  const account = await signup.json();
  equal(signup.ok, true, "Auth Emulator creates an isolated viewer");
  token = account.idToken;
  viewerId = account.localId;
  await Promise.all([
    db.collection("users").doc(viewerId).set({ email, emailVerified: true, role: "user", accountStatus: "active" }),
    db.collection("profiles").doc(viewerId).set({ username: `${prefix}_viewer`, displayName: "Private Viewer Identity", publicProfile: false, profileVisibility: "private", accountType: "user", planId: "free" })
  ]);

  const now = Date.now();
  const votingFields = {
    status: "voting_open",
    lifecycleStatus: "voting_open",
    votingEnabled: true,
    votingStartsAt: new Date(now - 60_000).toISOString(),
    votingDeadline: new Date(now + 86_400_000).toISOString(),
    submissionDeadline: new Date(now - 120_000).toISOString()
  };
  await db.collection("challenges").doc(publicId).set({ id: publicId, title: "Public rankings", visibility: "public", type: "Normal Challenge", creatorId: `${prefix}_owner`, ...votingFields });
  await db.collection("profiles").doc(`${prefix}_private_profile`).set({ username: "private-handle", displayName: "Private Person", publicProfile: false, profileVisibility: "private", status: "active" });
  const submissionBatch = db.batch();
  for (let index = 0; index < 45; index += 1) {
    const id = `${prefix}_submission_${String(index).padStart(3, "0")}`;
    const needle = index === 43 ? "Needle target entry" : `Entry ${index}`;
    submissionBatch.set(db.collection("submissions").doc(id), {
      id,
      challengeId: publicId,
      userId: index === 44 ? `${prefix}_private_profile` : `${prefix}_submitter_${index}`,
      userName: index === 44 ? "Private Person Legacy Name" : `Submitter ${index}`,
      title: needle,
      status: "approved",
      visibility: "public",
      publicVisibility: true,
      leaderboardEligible: true,
      leaderboardSearchPrefixes: index === 43 ? ["needle", "target", "entry", "needle target entry"] : ["entry", "submitter"],
      voteCount: 45 - index,
      leaderboardSortAt: new Date(now - (45 - index) * 1000).toISOString(),
      submittedAt: new Date(now - (45 - index) * 1000).toISOString(),
      createdAt: new Date(now - (45 - index) * 1000).toISOString(),
      ...(index === 44 ? { mediaStoragePath: mediaPath, mediaUrl: "https://firebasestorage.googleapis.com/v0/b/private/o/entry.png?alt=media&token=private-token" } : {})
    });
  }
  await submissionBatch.commit();

  const firstResponse = await participantsGet(request(`http://localhost/api/challenges/${publicId}/participants?page=1&pageSize=12`), routeParams(publicId));
  equal(firstResponse.status, 200, "first public participant page loads through the real handler");
  const first = (await firstResponse.json()).data;
  equal(first.pagination.total, 45, "filtered total covers all eligible records beyond one page");
  equal(first.participants.length, 12, "page size is applied before response");
  equal(first.participants[0].voteCount, 45, "highest-vote sorting places the leading entry first");
  check(Boolean(first.pagination.nextCursor), "first page exposes a continuation cursor");

  const secondResponse = await participantsGet(request(`http://localhost/api/challenges/${publicId}/participants?page=2&pageSize=12&cursor=${encodeURIComponent(first.pagination.nextCursor)}`), routeParams(publicId));
  equal(secondResponse.status, 200, "cursor continuation loads through the real handler");
  const second = (await secondResponse.json()).data;
  equal(second.participants.length, 12, "second page has the expected records");
  check(!first.participants.some((left) => second.participants.some((right) => left.submissionId === right.submissionId)), "cursor pages contain no duplicate submission IDs");
  check(second.participants[0].rank > first.participants.at(-1).rank, "rank numbers continue across cursor pages");

  const searchResponse = await participantsGet(request(`http://localhost/api/challenges/${publicId}/participants?search=needle&pageSize=12`), routeParams(publicId));
  const searched = (await searchResponse.json()).data;
  equal(searched.pagination.total, 1, "prefix search filters the complete matching dataset before pagination");
  equal(searched.participants[0].submissionTitle, "Needle target entry", "matching record beyond the initial sort window is found");
  equal(searched.participants[0].displayName, "Participant", "private profile identity is not copied from submission snapshots");
  check(!("userId" in searched.participants[0]), "public participant records omit internal user IDs");

  const invalidCursor = await participantsGet(request(`http://localhost/api/challenges/${publicId}/participants?cursor=not-a-valid-cursor`), routeParams(publicId));
  equal(invalidCursor.status, 400, "malformed continuation cursor uses the API validation status");

  const publicLeaderboard = await leaderboardGet(request(`http://localhost/api/leaderboards?type=challenge&challengeId=${publicId}&page=1`));
  equal(publicLeaderboard.status, 200, "public challenge leaderboard loads through its actual API handler");
  const publicLeaderboardData = (await publicLeaderboard.json()).data;
  check(publicLeaderboardData.entries.length > 0, "leaderboard API returns public participant rows");
  check(!("userId" in publicLeaderboardData.entries[0]), "leaderboard API does not expose internal user IDs");

  const publicDetailsResponse = await detailGet(request(`http://localhost/api/challenges/${publicId}`), routeParams(publicId));
  equal(publicDetailsResponse.status, 200, "public Challenge Details loads through its actual API handler");
  const publicDetails = (await publicDetailsResponse.json()).data;
  equal(publicDetails.submissions.length, 5, "Challenge Details loads only the top-five preview page");
  equal(publicDetails.topParticipants.length, 5, "Challenge Details exposes the five ranked preview entries");
  check(!("userId" in publicDetails.topParticipants[0]), "Challenge Details preview omits internal participant IDs");

  await db.collection("challenges").doc(privateId).set({
    id: privateId,
    title: "Locked voting preview",
    description: "Do not expose this private description.",
    privateAccessMethod: "invite_link",
    privateJoiningPolicy: "invite_only",
    privateVotingAccess: "public_voting",
    visibility: "private",
    type: "Private / Exclusive",
    creatorId: `${prefix}_owner`,
    hideParticipantList: false,
    ...votingFields
  });
  await db.collection("submissions").doc(`${prefix}_private_submission`).set({
    id: `${prefix}_private_submission`, challengeId: privateId, userId: `${prefix}_private_profile`,
    title: "Public-facing approved entry", userName: "Private Person Legacy Name", status: "approved",
    visibility: "public", publicVisibility: true, leaderboardEligible: true, leaderboardSearchPrefixes: ["public", "facing", "approved", "entry"],
    voteCount: 0, leaderboardSortAt: new Date(now - 5000).toISOString(), submittedAt: new Date(now - 5000).toISOString(),
    mediaStoragePath: mediaPath, mediaUrl: "https://firebasestorage.googleapis.com/v0/b/private/o/entry.png?alt=media&token=private-token"
  });
  const privateParticipantsResponse = await participantsGet(request(`http://localhost/api/challenges/${privateId}/participants?pageSize=12`), routeParams(privateId));
  equal(privateParticipantsResponse.status, 200, "signed-in public-voting viewer can access the narrow voting endpoint");
  const privateVotingData = (await privateParticipantsResponse.json()).data;
  equal(privateVotingData.challenge.title, "Locked voting preview", "voting endpoint exposes only its reduced public challenge summary");
  check(!("description" in privateVotingData.challenge) && !("privateAccessMethod" in privateVotingData.challenge) && !("privateJoiningPolicy" in privateVotingData.challenge), "private instructions and access configuration remain hidden");
  equal(privateVotingData.participants[0].displayName, "Participant", "private profile identity remains hidden in public voting");
  equal(privateVotingData.participants[0].submissionMediaUrl, challengeMediaDeliveryUrl(mediaPath), "protected submission media is served through the authenticated media route");
  check(!privateVotingData.participants[0].submissionMediaUrl.includes("private-token"), "stored Firebase download token is not exposed");
  check(!("userId" in privateVotingData.participants[0]), "public voting rows omit internal participant IDs");

  const privateDetails = await detailGet(request(`http://localhost/api/challenges/${privateId}`), routeParams(privateId));
  equal(privateDetails.status, 403, "public voting configuration does not grant full private Challenge details");
  const privateComments = await commentsGet(request(`http://localhost/api/challenges/${privateId}/comments`), routeParams(privateId));
  equal(privateComments.status, 404, "public voting configuration does not grant private comments");

  const voteResponse = await votePost(request("http://localhost/api/votes", token, "POST", { challengeId: privateId, submissionId: `${prefix}_private_submission`, voteMode: "free", quantity: 1 }));
  equal(voteResponse.status, 200, "authenticated public-voting viewer can cast a valid vote without participation access");
  equal((await db.collection("privateChallengeAccess").doc(`${privateId}_${viewerId}`).get()).exists, false, "casting a public vote does not create private participation access");

  const hiddenId = `${prefix}_hidden`;
  await db.collection("challenges").doc(hiddenId).set({ id: hiddenId, title: "Hidden count", visibility: "public", type: "Normal Challenge", creatorId: `${prefix}_owner`, hideParticipantList: true, ...votingFields });
  const hiddenPage = await participantsGet(request(`http://localhost/api/challenges/${hiddenId}/participants`), routeParams(hiddenId));
  equal(hiddenPage.status, 200, "hidden participant list remains a valid response");
  const hiddenData = (await hiddenPage.json()).data;
  equal(hiddenData.pagination.total, null, "hidden participant total is not disclosed");
  equal(hiddenData.pagination.hasMore, false, "hidden list does not disclose continuation state");
} finally {
  for (const collection of ["submissions", "votes", "voteRequests", "freeVoteDailyGuards", "paidVoteDailyGuards", "challengeParticipants", "challengeComments"]) {
    const snapshot = await db.collection(collection).where("challengeId", "in", [publicId, privateId, `${prefix}_hidden`]).get().catch(() => null);
    if (snapshot) await Promise.all(snapshot.docs.map((doc) => doc.ref.delete()));
  }
  await Promise.all([publicId, privateId, `${prefix}_hidden`].map((id) => db.collection("challenges").doc(id).delete().catch(() => undefined)));
  await db.collection("profiles").doc(`${prefix}_private_profile`).delete().catch(() => undefined);
  if (viewerId) {
    await Promise.all([db.collection("users").doc(viewerId).delete(), db.collection("profiles").doc(viewerId).delete(), auth.deleteUser(viewerId).catch(() => undefined)]);
  }
  await app.delete();
}

console.log(`challenge leaderboard and private voting emulator checks passed (${checks} assertions)`);
