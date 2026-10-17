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
const zeroVoteId = `${prefix}_zero_votes`;
const hiddenRankingId = `${prefix}_hidden_ranking`;
const topTenId = `${prefix}_top_ten`;
const disputedId = `${prefix}_disputed`;
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
      voteCount: index === 0 ? 45 : 0,
      leaderboardSortAt: new Date(now - (45 - index) * 1000).toISOString(),
      submittedAt: new Date(now - (45 - index) * 1000).toISOString(),
      createdAt: new Date(now - (45 - index) * 1000).toISOString(),
      ...(index === 44 ? { mediaStoragePath: mediaPath, mediaUrl: "https://firebasestorage.googleapis.com/v0/b/private/o/entry.png?alt=media&token=private-token" } : {})
    });
  }
  await submissionBatch.commit();
  const voteBatch = db.batch();
  for (let index = 0; index < 45; index += 1) {
    const voteRef = db.collection("votes").doc(`${prefix}_verified_vote_${String(index).padStart(3, "0")}`);
    voteBatch.set(voteRef, { id: voteRef.id, challengeId: publicId, submissionId: `${prefix}_submission_000`, voterId: `${prefix}_voter_${index}`, status: "counted", voteMode: "free", createdAt: new Date(now - index * 1000).toISOString() });
  }
  await voteBatch.commit();

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

  await db.collection("challenges").doc(zeroVoteId).set({ id: zeroVoteId, title: "No verified votes", visibility: "public", type: "Normal Challenge", creatorId: `${prefix}_owner`, ...votingFields });
  await db.collection("submissions").doc(`${prefix}_zero_submission`).set({ id: `${prefix}_zero_submission`, challengeId: zeroVoteId, userId: `${prefix}_zero_submitter`, title: "Approved entry", status: "approved", visibility: "public", publicVisibility: true, leaderboardEligible: true, voteCount: 0, submittedAt: new Date(now - 3000).toISOString() });
  const zeroResponse = await participantsGet(request(`http://localhost/api/challenges/${zeroVoteId}/participants`), routeParams(zeroVoteId));
  equal(zeroResponse.status, 200, "eligible entries remain browsable before the first verified vote");
  equal((await zeroResponse.json()).data.participants.length, 1, "no-vote challenge retains participant browsing");
  const zeroDetailsResponse = await detailGet(request(`http://localhost/api/challenges/${zeroVoteId}`), routeParams(zeroVoteId));
  equal(zeroDetailsResponse.status, 200, "no-vote challenge details still load");
  const zeroDetails = (await zeroDetailsResponse.json()).data;
  equal(zeroDetails.topParticipants.length, 0, "ranked preview is omitted until the first verified vote");
  equal(zeroDetails.leaderboard.hasVerifiedVotes, false, "zero-vote state uses counted vote records");
  const zeroLeaderboardResponse = await leaderboardGet(request(`http://localhost/api/leaderboards?type=challenge&challengeId=${zeroVoteId}`));
  const zeroLeaderboard = (await zeroLeaderboardResponse.json()).data;
  equal(zeroLeaderboard.hasVerifiedVotes, false, "full challenge board uses verified vote existence rather than submission count");
  check(zeroLeaderboard.entries.every((entry) => entry.rank === null && entry.voteCount === null), "pre-vote entries remain browseable without exposing a ranked order or vote totals");

  await db.collection("challenges").doc(hiddenRankingId).set({ id: hiddenRankingId, visibility: "public", type: "Normal Challenge", creatorId: `${prefix}_owner`, hideRankings: true, ...votingFields });
  await db.collection("submissions").doc(`${prefix}_hidden_submission`).set({ id: `${prefix}_hidden_submission`, challengeId: hiddenRankingId, userId: `${prefix}_hidden_submitter`, title: "Hidden entry", status: "approved", visibility: "public", publicVisibility: true, leaderboardEligible: true, voteCount: 4, submittedAt: new Date(now - 1000).toISOString() });
  await db.collection("votes").doc(`${prefix}_hidden_vote`).set({ id: `${prefix}_hidden_vote`, challengeId: hiddenRankingId, submissionId: `${prefix}_hidden_submission`, voterId: `${prefix}_hidden_voter`, status: "counted", createdAt: new Date(now).toISOString() });
  const hiddenRankingResponse = await leaderboardGet(request(`http://localhost/api/leaderboards?type=challenge&challengeId=${hiddenRankingId}`));
  const hiddenRankingData = (await hiddenRankingResponse.json()).data;
  equal(hiddenRankingResponse.status, 200, "hidden ranking request returns a safe response");
  check(hiddenRankingData.entries.every((entry) => entry.rank === null && entry.voteCount === null), "hidden rankings redact rank and vote totals at the API layer");
  equal(hiddenRankingData.entries.length, 1, "hidden rankings still permit neutral participant browsing");
  const hiddenDetailsResponse = await detailGet(request(`http://localhost/api/challenges/${hiddenRankingId}`), routeParams(hiddenRankingId));
  const hiddenDetails = (await hiddenDetailsResponse.json()).data;
  equal(hiddenDetailsResponse.status, 200, "hidden rankings do not block the main challenge details");
  equal(hiddenDetails.topParticipants.length, 0, "challenge details do not expose top-participant aliases while ranks are hidden");

  await db.collection("challenges").doc(topTenId).set({ id: topTenId, title: "Top ten only", visibility: "public", type: "Normal Challenge", creatorId: `${prefix}_owner`, leaderboardVisibilityMode: "top_10_only", ...votingFields });
  const topTenBatch = db.batch();
  for (let index = 0; index < 12; index += 1) {
    const submissionId = `${prefix}_top_ten_submission_${String(index).padStart(2, "0")}`;
    topTenBatch.set(db.collection("submissions").doc(submissionId), { id: submissionId, challengeId: topTenId, userId: `${prefix}_top_ten_user_${index}`, title: `Top ten entry ${index}`, status: "approved", visibility: "public", leaderboardEligible: true, voteCount: 12 - index, leaderboardSortAt: new Date(now - index * 1000).toISOString(), submittedAt: new Date(now - index * 1000).toISOString() });
    topTenBatch.set(db.collection("votes").doc(`${prefix}_top_ten_vote_${String(index).padStart(2, "0")}`), { challengeId: topTenId, submissionId, voterId: `${prefix}_top_ten_voter_${index}`, status: "counted", createdAt: new Date(now - index * 1000).toISOString() });
  }
  await topTenBatch.commit();
  const topTenPageOneResponse = await leaderboardGet(request(`http://localhost/api/leaderboards?type=challenge&challengeId=${topTenId}&page=1&pageSize=36`));
  const topTenPageOne = (await topTenPageOneResponse.json()).data;
  equal(topTenPageOneResponse.status, 200, "top-ten leaderboard is available while voting is open");
  equal(topTenPageOne.entries.length, 10, "top-ten-only returns no more than ten entries");
  equal(topTenPageOne.pagination.total, 10, "top-ten pagination exposes only the configured ten entries");
  equal(topTenPageOne.pagination.eligibleTotal, 10, "top-ten pagination does not expose the complete participant count");
  equal(topTenPageOne.pagination.hasMore, false, "top-ten pagination does not imply additional hidden entries");
  check(topTenPageOne.entries.every((entry) => typeof entry.rank === "number" && entry.voteCount === null), "top-ten mode exposes positions but not exact vote totals while voting is open");
  const topTenPageTwoResponse = await leaderboardGet(request(`http://localhost/api/leaderboards?type=challenge&challengeId=${topTenId}&page=2&pageSize=10`));
  const topTenPageTwo = (await topTenPageTwoResponse.json()).data;
  equal(topTenPageTwo.entries.length, 0, "page two cannot reveal entries outside the top ten");
  equal(topTenPageTwo.pagination.hasMore, false, "page two does not expose hidden continuation metadata");

  await db.collection("challenges").doc(privateId).set({
    id: privateId,
    title: "Locked voting preview",
    description: "Do not expose this private description.",
    privateAccessMethod: "invite_link",
    privateJoiningPolicy: "invite_only",
    privateVotingAccess: "public_voting",
    publicPreviewEnabled: true,
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
  await db.collection("challenges").doc(privateId).update({ publicPreviewEnabled: false });
  equal((await participantsGet(request(`http://localhost/api/challenges/${privateId}/participants`), routeParams(privateId))).status, 403, "non-discoverable Private Challenges do not expose public-voting participants");
  await db.collection("challenges").doc(privateId).update({ publicPreviewEnabled: true });
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

  await db.collection("challenges").doc(disputedId).set({ id: disputedId, visibility: "public", type: "Normal Challenge", creatorId: `${prefix}_owner`, leaderboardStatus: "disputed", ...votingFields });
  await db.collection("submissions").doc(`${prefix}_disputed_submission`).set({ id: `${prefix}_disputed_submission`, challengeId: disputedId, userId: `${prefix}_disputed_submitter`, title: "Restricted entry", status: "approved", visibility: "public", leaderboardEligible: true, voteCount: 3, submittedAt: new Date(now).toISOString() });
  const disputedResponse = await leaderboardGet(request(`http://localhost/api/leaderboards?type=challenge&challengeId=${disputedId}`));
  const disputedData = (await disputedResponse.json()).data;
  equal(disputedResponse.status, 200, "disputed rankings return a safe unavailable state");
  equal(disputedData.entries.length, 0, "disputed participant entries are withheld");
  equal(disputedData.pagination, null, "disputed participant counts and continuation metadata are withheld");
} finally {
  for (const collection of ["submissions", "votes", "voteRequests", "freeVoteDailyGuards", "paidVoteDailyGuards", "challengeParticipants", "challengeComments"]) {
    const snapshot = await db.collection(collection).where("challengeId", "in", [publicId, privateId, `${prefix}_hidden`, zeroVoteId, hiddenRankingId, disputedId, topTenId]).get().catch(() => null);
    if (snapshot) await Promise.all(snapshot.docs.map((doc) => doc.ref.delete()));
  }
  await Promise.all([publicId, privateId, `${prefix}_hidden`, zeroVoteId, hiddenRankingId, disputedId, topTenId].map((id) => db.collection("challenges").doc(id).delete().catch(() => undefined)));
  await db.collection("profiles").doc(`${prefix}_private_profile`).delete().catch(() => undefined);
  if (viewerId) {
    await Promise.all([db.collection("users").doc(viewerId).delete(), db.collection("profiles").doc(viewerId).delete(), auth.deleteUser(viewerId).catch(() => undefined)]);
  }
  await app.delete();
}

console.log(`challenge leaderboard and private voting emulator checks passed (${checks} assertions)`);
