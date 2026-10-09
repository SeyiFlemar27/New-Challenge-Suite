import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore } from "firebase-admin/firestore";

assert.ok(process.env.FIRESTORE_EMULATOR_HOST, "FIRESTORE_EMULATOR_HOST is required");
assert.ok(process.env.FIREBASE_AUTH_EMULATOR_HOST, "FIREBASE_AUTH_EMULATOR_HOST is required");

const projectId = process.env.FIREBASE_PROJECT_ID ?? "demo-challenge-suite";
const app = initializeApp({ projectId });
const db = getFirestore(app);
const auth = getAuth(app);
const { POST: castVote } = await import("../app/api/tournaments/[id]/votes/route.ts");
const { GET: loadTournament } = await import("../app/api/tournaments/[id]/route.ts");
const { POST: confirmResult } = await import("../app/api/tournaments/[id]/results/route.ts");
const runId = `tournament_vote_${randomUUID().replaceAll("-", "")}`;
const tournamentId = `${runId}_tournament`;
const tournamentBId = `${runId}_other_tournament`;
const host = await createUser("host");
const voters = await Promise.all(Array.from({ length: 7 }, (_, index) => createUser(`voter${index}`)));
let assertions = 0;

function check(condition, message) { assert.ok(condition, message); assertions += 1; }
function equal(actual, expected, message) { assert.equal(actual, expected, message); assertions += 1; }
function request(url, token, body) {
  return new Request(url, { method: "POST", headers: { ...(token ? { authorization: `Bearer ${token}` } : {}), "content-type": "application/json" }, body: JSON.stringify(body) });
}
async function createUser(label) {
  const email = `${label}-${randomUUID()}@example.test`;
  const response = await fetch(`http://${process.env.FIREBASE_AUTH_EMULATOR_HOST}/identitytoolkit.googleapis.com/v1/accounts:signUp?key=fake-api-key`, {
    method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ email, password: "TestPassword123!", returnSecureToken: true })
  });
  const body = await response.json();
  assert.equal(response.ok, true, JSON.stringify(body));
  await db.collection("users").doc(body.localId).set({ emailVerified: true, role: "creator", accountStatus: "active" });
  return { uid: body.localId, token: body.idToken };
}
function tournament(id, overrides = {}) {
  return { id, hostId: host.uid, status: "round_active", resultMethod: "votes", participationMode: "individual", voting: { paidVotesActive: false }, tieBreaker: "host_review", scoreVisibility: "final_only", ...overrides };
}
async function seedMatch({ matchId, id = tournamentId, tournamentData = {}, roundData = {}, matchData = {}, participantAId, participantBId, submissionAId, submissionBId }) {
  const now = Date.now();
  await db.collection("tournaments").doc(id).set(tournament(id, tournamentData));
  const roundId = `${matchId}_round`;
  await db.collection("tournamentRounds").doc(roundId).set({ id: roundId, tournamentId: id, roundNumber: 1, status: "active", votingOpensAt: new Date(now - 60_000).toISOString(), votingClosesAt: new Date(now + 60_000).toISOString(), ...roundData });
  await db.collection("tournamentMatches").doc(matchId).set({ id: matchId, tournamentId: id, roundId, roundNumber: 1, status: "active", participantAId, participantBId, resultMethod: "votes", ...matchData });
  const competitors = id === tournamentId ? [participantAId, participantBId] : [participantAId, participantBId];
  await Promise.all(competitors.filter(Boolean).map((participantId) => db.collection("tournamentParticipants").doc(participantId).set({ id: participantId, tournamentId: id, userId: participantId, status: "active" })));
  for (const [submissionId, participantId] of [[submissionAId, participantAId], [submissionBId, participantBId]]) {
    if (submissionId && participantId) await db.collection("tournamentSubmissions").doc(submissionId).set({ id: submissionId, tournamentId: id, matchId, roundId, participantId, status: "submitted", mediaUrl: "https://example.test/entry.png", mediaPath: `tournaments/${id}/${submissionId}` });
  }
  return roundId;
}
async function vote({ voter, matchId, submissionId, participantId, tournament = tournamentId, voteType = "free" }) {
  return castVote(request(`http://localhost/api/tournaments/${tournament}/votes`, voter?.token, { matchId, submissionId, selectedParticipantId: participantId, voteType }), { params: Promise.resolve({ id: tournament }) });
}

try {
  const matchId = `${runId}_match`;
  const participantAId = `${runId}_participant_a`;
  const participantBId = `${runId}_participant_b`;
  const submissionAId = `${runId}_submission_a`;
  const submissionBId = `${runId}_submission_b`;
  const roundId = await seedMatch({ matchId, participantAId, participantBId, submissionAId, submissionBId });

  const unauthenticated = await vote({ voter: null, matchId, submissionId: submissionAId, participantId: participantAId });
  equal(unauthenticated.status, 401, "unauthenticated voters are rejected");
  await db.collection("users").doc(voters[6].uid).update({ accountStatus: "suspended" });
  const ineligibleVoter = await vote({ voter: voters[6], matchId, submissionId: submissionAId, participantId: participantAId });
  equal(ineligibleVoter.status, 403, "suspended accounts cannot vote");
  equal((await db.collection("tournamentMatches").doc(matchId).get()).data()?.voteCountA ?? 0, 0, "ineligible voter has no scoring effect");

  const paid = await vote({ voter: voters[0], matchId, submissionId: submissionAId, participantId: participantAId, voteType: "paid" });
  equal(paid.status, 400, "forged paid vote is rejected");
  equal((await db.collection("tournamentVotes").where("tournamentId", "==", tournamentId).get()).size, 0, "paid vote creates no vote record");

  const valid = await vote({ voter: voters[0], matchId, submissionId: submissionAId, participantId: participantAId });
  equal(valid.status, 200, "eligible authenticated voter can cast a free vote");
  equal((await db.collection("tournamentVotes").doc(`${tournamentId}_${matchId}_${voters[0].uid}`).get()).data()?.participantId, participantAId, "vote is persisted against the validated participant");
  equal((await db.collection("tournamentMatches").doc(matchId).get()).data()?.voteCountA, 1, "one vote increments the match's authoritative tally once");
  equal((await db.collection("tournamentMatches").doc(matchId).get()).data()?.voteCountB ?? 0, 0, "vote does not affect the opposing match target");
  const duplicate = await vote({ voter: voters[0], matchId, submissionId: submissionAId, participantId: participantAId });
  equal(duplicate.status, 200, "same-target retry returns the original vote idempotently");
  equal((await duplicate.json()).data?.idempotentReplay, true, "duplicate response identifies the idempotent replay");
  const conflictingDuplicate = await vote({ voter: voters[0], matchId, submissionId: submissionBId, participantId: participantBId });
  equal(conflictingDuplicate.status, 409, "an account cannot change its vote target after the first vote");
  const duplicateDocCount = (await db.collection("tournamentVotes").where("tournamentId", "==", tournamentId).where("matchId", "==", matchId).where("voterId", "==", voters[0].uid).get()).size;
  equal(duplicateDocCount, 1, "duplicate request leaves one vote record");
  equal((await db.collection("tournamentMatches").doc(matchId).get()).data()?.voteCountA, 1, "duplicate does not increase score");
  const hiddenDetailResponse = await loadTournament(new Request(`http://localhost/api/tournaments/${tournamentId}`), { params: Promise.resolve({ id: tournamentId }) });
  const hiddenDetail = (await hiddenDetailResponse.json()).data;
  const hiddenMatch = hiddenDetail.matches.find((item) => item.id === matchId);
  equal(hiddenMatch.voteCountA, undefined, "final-only scores are not exposed while the match remains active");
  const liveTournamentId = `${runId}_live_tournament`;
  const liveMatchId = `${runId}_live_match`;
  const liveA = `${runId}_live_a`;
  const liveB = `${runId}_live_b`;
  await seedMatch({ matchId: liveMatchId, id: liveTournamentId, tournamentData: { scoreVisibility: "live" }, participantAId: liveA, participantBId: liveB, matchData: { voteCountA: 3, voteCountB: 2 } });
  const liveDetailResponse = await loadTournament(new Request(`http://localhost/api/tournaments/${liveTournamentId}`), { params: Promise.resolve({ id: liveTournamentId }) });
  const liveDetail = (await liveDetailResponse.json()).data;
  const liveMatch = liveDetail.matches.find((item) => item.id === liveMatchId);
  equal(liveMatch.voteCountA, 3, "live Tournament scores follow the configured live visibility");

  const concurrentMatch = `${runId}_concurrent_match`;
  const concurrentA = `${runId}_concurrent_a`;
  const concurrentB = `${runId}_concurrent_b`;
  const concurrentSubA = `${runId}_concurrent_sub_a`;
  await seedMatch({ matchId: concurrentMatch, participantAId: concurrentA, participantBId: concurrentB, submissionAId: concurrentSubA });
  const concurrentResults = await Promise.all([
    vote({ voter: voters[1], matchId: concurrentMatch, submissionId: concurrentSubA, participantId: concurrentA }),
    vote({ voter: voters[1], matchId: concurrentMatch, submissionId: concurrentSubA, participantId: concurrentA })
  ]);
  const concurrentBodies = await Promise.all(concurrentResults.map(async (response) => ({ status: response.status, body: await response.clone().json() })));
  if (concurrentBodies.some((result) => result.status !== 200)) console.error("Concurrent same-target vote responses:", JSON.stringify(concurrentBodies));
  equal(concurrentResults.filter((response) => response.status === 200).length, 2, `concurrent same-target requests resolve idempotently (${JSON.stringify(concurrentBodies)})`);
  equal((await db.collection("tournamentMatches").doc(concurrentMatch).get()).data()?.voteCountA, 1, "concurrent duplicate increments tally once");

  const invalidCases = [];
  invalidCases.push(await vote({ voter: voters[2], matchId: `${runId}_missing_match`, submissionId: submissionAId, participantId: participantAId }));
  invalidCases.push(await vote({ voter: voters[2], matchId, submissionId: submissionAId, participantId: `${runId}_forged_participant` }));
  invalidCases.push(await vote({ voter: voters[2], matchId, submissionId: `${runId}_forged_submission`, participantId: participantAId }));
  await db.collection("tournamentParticipants").doc(`${runId}_disqualified`).set({ id: `${runId}_disqualified`, tournamentId, userId: "bad", status: "disqualified" });
  await db.collection("tournamentSubmissions").doc(`${runId}_disqualified_submission`).set({ id: `${runId}_disqualified_submission`, tournamentId, matchId, roundId, participantId: `${runId}_disqualified`, status: "disqualified" });
  invalidCases.push(await vote({ voter: voters[2], matchId, submissionId: `${runId}_disqualified_submission`, participantId: `${runId}_disqualified` }));
  equal(invalidCases.every((response) => response.status >= 400), true, "missing match, forged target/submission, and disqualified target are rejected");

  const otherMatch = `${runId}_cross_match`;
  const otherA = `${runId}_cross_a`;
  const otherB = `${runId}_cross_b`;
  const otherSub = `${runId}_cross_sub`;
  await seedMatch({ matchId: otherMatch, id: tournamentBId, participantAId: otherA, participantBId: otherB, submissionAId: otherSub });
  const crossTournament = await vote({ voter: voters[2], matchId: otherMatch, submissionId: otherSub, participantId: otherA, tournament: tournamentId });
  equal(crossTournament.status, 403, "cross-Tournament match is rejected");

  for (const [label, tournamentData, roundData, matchData, expectedStatus] of [
    ["not open", { status: "active" }, { votingOpensAt: new Date(Date.now() + 60_000).toISOString() }, {}, 409],
    ["closed", { status: "active" }, { votingClosesAt: new Date(Date.now() - 60_000).toISOString() }, {}, 409],
    ["completed Tournament", { status: "completed" }, {}, {}, 409],
    ["cancelled Tournament", { status: "cancelled" }, {}, {}, 409],
    ["completed match", { status: "round_active" }, {}, { status: "confirmed" }, 409],
    ["round mismatch", { status: "round_active" }, {}, { roundNumber: 2 }, 409],
    ["judges-only result", { status: "round_active", resultMethod: "judges" }, {}, { resultMethod: "judges" }, 409],
  ]) {
    const invalidMatch = `${runId}_${label.replaceAll(" ", "_")}`;
    const invalidA = `${invalidMatch}_a`;
    const invalidB = `${invalidMatch}_b`;
    const invalidSubmission = `${invalidMatch}_submission`;
    await seedMatch({ matchId: invalidMatch, participantAId: invalidA, participantBId: invalidB, submissionAId: invalidSubmission, tournamentData, roundData, matchData });
    const response = await vote({ voter: voters[3], matchId: invalidMatch, submissionId: invalidSubmission, participantId: invalidA });
    equal(response.status, expectedStatus, `${label} voting state rejects the request`);
    equal((await db.collection("tournamentVotes").doc(`${tournamentId}_${invalidMatch}_${voters[3].uid}`).get()).exists, false, `${label} request creates no vote record`);
  }

  const teamTournamentId = `${runId}_team_tournament`;
  const teamMatchId = `${runId}_team_match`;
  const teamA = `${runId}_team_a`;
  const teamB = `${runId}_team_b`;
  const teamSubmission = `${runId}_team_submission`;
  await seedMatch({ matchId: teamMatchId, id: teamTournamentId, tournamentData: { participationMode: "team" }, participantAId: teamA, participantBId: teamB, submissionAId: teamSubmission });
  await db.collection("tournamentTeams").doc(teamA).set({ id: teamA, tournamentId: teamTournamentId, status: "active", captainUserId: voters[4].uid, memberUserIds: [voters[4].uid] });
  await db.collection("tournamentTeams").doc(teamB).set({ id: teamB, tournamentId: teamTournamentId, status: "active", captainUserId: voters[5].uid, memberUserIds: [voters[5].uid] });
  await db.collection("tournamentSubmissions").doc(teamSubmission).set({ tournamentId: teamTournamentId, matchId: teamMatchId, roundId: `${teamMatchId}_round`, participantId: teamA, teamId: teamA, status: "submitted" }, { merge: true });
  const validTeamVote = await vote({ voter: voters[4], matchId: teamMatchId, submissionId: teamSubmission, participantId: teamA, tournament: teamTournamentId });
  equal(validTeamVote.status, 200, "valid Team target and Team-owned submission are accepted");
  const forgedTeamVote = await vote({ voter: voters[5], matchId: teamMatchId, submissionId: teamSubmission, participantId: teamB, tournament: teamTournamentId });
  equal(forgedTeamVote.status, 403, "Team submission cannot be attributed to another Team");

  const scoringMatchId = `${runId}_scoring_match`;
  const scoringA = `${runId}_scoring_a`;
  const scoringB = `${runId}_scoring_b`;
  const scoringSubA = `${runId}_scoring_sub_a`;
  const scoringSubB = `${runId}_scoring_sub_b`;
  const scoringRoundId = await seedMatch({ matchId: scoringMatchId, participantAId: scoringA, participantBId: scoringB, submissionAId: scoringSubA, submissionBId: scoringSubB });
  const voteA = await vote({ voter: voters[0], matchId: scoringMatchId, submissionId: scoringSubA, participantId: scoringA });
  const voteA2 = await vote({ voter: voters[1], matchId: scoringMatchId, submissionId: scoringSubA, participantId: scoringA });
  const voteB = await vote({ voter: voters[2], matchId: scoringMatchId, submissionId: scoringSubB, participantId: scoringB });
  equal([voteA.status, voteA2.status, voteB.status].every((status) => status === 200), true, "three valid free votes persist for scoring fixture");
  await db.collection("tournamentRounds").doc(scoringRoundId).update({ votingClosesAt: new Date(Date.now() - 1_000).toISOString() });
  const retryAfterClose = await vote({ voter: voters[0], matchId: scoringMatchId, submissionId: scoringSubA, participantId: scoringA });
  equal(retryAfterClose.status, 200, "retry after voting closes returns the already committed vote");
  equal((await db.collection("tournamentMatches").doc(scoringMatchId).get()).data()?.voteCountA, 2, "post-close idempotent retry does not increment the tally");
  const nextMatchId = `${runId}_scoring_next`;
  await db.collection("tournamentMatches").doc(scoringMatchId).set({ nextMatchId, nextSlot: "A" }, { merge: true });
  await db.collection("tournamentMatches").doc(nextMatchId).set({ id: nextMatchId, tournamentId, roundId, roundNumber: 2, status: "scheduled", participantAId: null, participantBId: null });
  const resultResponse = await confirmResult(request(`http://localhost/api/tournaments/${tournamentId}/results`, host.token, { matchId: scoringMatchId, winnerParticipantId: scoringA, loserParticipantId: scoringB, winnerScore: 1, loserScore: 0 }), { params: Promise.resolve({ id: tournamentId }) });
  equal(resultResponse.status, 200, `verified vote winner can be confirmed and advanced: ${await resultResponse.clone().text()}`);
  equal((await db.collection("tournamentMatches").doc(scoringMatchId).get()).data()?.status, "confirmed", "vote result confirms the same match");
  equal((await db.collection("tournamentMatches").doc(nextMatchId).get()).data()?.participantAId, scoringA, "vote winner advances through the official match result path");
  equal((await db.collection("tournamentParticipants").doc(scoringA).get()).data()?.cumulativeScore ?? 0, 0, "client-supplied score does not alter cumulative Tournament scoring for a vote-decided match");
  const finalDetailResponse = await loadTournament(new Request(`http://localhost/api/tournaments/${tournamentId}`), { params: Promise.resolve({ id: tournamentId }) });
  const finalDetail = (await finalDetailResponse.json()).data;
  const finalMatch = finalDetail.matches.find((item) => item.id === scoringMatchId);
  equal(finalMatch.voteCountA, 2, "final-only vote scores become visible after server confirmation");
  const wrongResultMatchId = `${runId}_wrong_result_match`;
  const wrongA = `${runId}_wrong_a`;
  const wrongB = `${runId}_wrong_b`;
  const wrongSubA = `${runId}_wrong_sub_a`;
  const wrongSubB = `${runId}_wrong_sub_b`;
  const wrongRoundId = await seedMatch({ matchId: wrongResultMatchId, participantAId: wrongA, participantBId: wrongB, submissionAId: wrongSubA, submissionBId: wrongSubB, roundData: { votingClosesAt: new Date(Date.now() - 1_000).toISOString() } });
  await db.collection("tournamentMatches").doc(wrongResultMatchId).set({ voteCountA: 2, voteCountB: 1 }, { merge: true });
  const wrongResult = await confirmResult(request(`http://localhost/api/tournaments/${tournamentId}/results`, host.token, { matchId: wrongResultMatchId, winnerParticipantId: wrongB, loserParticipantId: wrongA, winnerScore: 1, loserScore: 0 }), { params: Promise.resolve({ id: tournamentId }) });
  equal(wrongResult.status, 409, "winner cannot override verified vote tally");
  equal((await db.collection("tournamentMatches").doc(wrongResultMatchId).get()).data()?.status, "active", "mismatched result has no official scoring or advancement effect");
  check(Boolean(wrongRoundId), "wrong-result fixture round exists");

  console.log(`PASS actual Tournament vote and result handlers against Firebase Auth/Firestore Emulator: ${assertions} assertions; free vote idempotency, relationship checks, voting windows, Team integrity, vote tally, and advancement verified.`);
} finally {
  const collectionNames = ["tournamentVotes", "tournamentSubmissions", "tournamentParticipants", "tournamentTeams", "tournamentRounds", "tournamentMatches", "tournamentPlacements", "tournamentAuditEvents"];
  for (const collection of collectionNames) {
    const snapshots = await db.collection(collection).where("tournamentId", "in", [tournamentId, tournamentBId, `${runId}_team_tournament`, `${runId}_live_tournament`]).get().catch(() => null);
    if (snapshots) await Promise.all(snapshots.docs.map((doc) => doc.ref.delete()));
  }
  await db.collection("tournaments").doc(tournamentId).delete().catch(() => {});
  await db.collection("tournaments").doc(tournamentBId).delete().catch(() => {});
  await db.collection("tournaments").doc(`${runId}_team_tournament`).delete().catch(() => {});
  await db.collection("tournaments").doc(`${runId}_live_tournament`).delete().catch(() => {});
  await Promise.all([host, ...voters].map((user) => db.collection("users").doc(user.uid).delete().catch(() => {})));
  await Promise.all([host, ...voters].map((user) => auth.deleteUser(user.uid).catch(() => {})));
  await app.delete();
}
