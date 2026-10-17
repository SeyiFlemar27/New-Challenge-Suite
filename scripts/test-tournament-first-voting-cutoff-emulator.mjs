import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { initializeApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import { processTournamentLifecycleAction } from "../lib/server/tournament-lifecycle-scheduler.ts";
import { readTournamentSponsorVotingEvidence } from "../lib/server/tournament-sponsor-evidence.ts";
assert.match(process.env.GCLOUD_PROJECT ?? "", /^demo-/);
assert.match(process.env.FIRESTORE_EMULATOR_HOST ?? "", /^127\.0\.0\.1:\d+$/);
const db = getFirestore(initializeApp({ projectId: process.env.GCLOUD_PROJECT })), id = `first_vote_${randomUUID()}`;
let assertions = 0;
const equal = (actual, expected) => { assert.equal(actual, expected); assertions++; };
const tournament = { id, configVersion: 3, status: "active", participationMode: "individual", format: "single_elimination", submissionDurationHours: 48, votingDurationHours: 72 };
async function match(label, deadline) {
  const matchId = `${id}_${label}`, roundId = `${matchId}_round`;
  await db.collection("tournamentRounds").doc(roundId).set({ tournamentId: id, roundNumber: 1, status: "active" });
  await db.collection("tournamentMatches").doc(matchId).set({ tournamentId: id, roundId, roundNumber: 1, status: "submissions_open", participantAId: `${matchId}_a`, participantBId: `${matchId}_b`, submissionDeadlineAt: deadline });
  for (const suffix of ["a", "b"]) {
    const participantId = `${matchId}_${suffix}`;
    await db.collection("tournamentParticipants").doc(participantId).set({ tournamentId: id, userId: participantId, status: "active" });
    await db.collection("tournamentSubmissions").doc(`${id}_${matchId}_${participantId}`).set({ tournamentId: id, matchId, participantId, status: "approved" });
  }
  return matchId;
}
async function processAt(time) {
  const current = (await db.collection("tournaments").doc(id).get()).data();
  return processTournamentLifecycleAction({ db, id, tournament: { ...current, id }, action: "process_match_deadlines", actorId: "system_tournament_lifecycle", now: new Date(time) });
}
try {
  await db.collection("tournaments").doc(id).set(tournament);
  const first = await match("first", "2026-10-10T12:02:00.000Z");
  const second = await match("second", "2026-10-10T12:03:00.000Z");
  await db.collection("tournaments").doc(id).update({ status: "paused" });
  await processAt("2026-10-10T12:02:00.000Z");
  equal((await db.collection("tournamentMatches").doc(first).get()).data().status, "submissions_open");
  equal((await db.collection("tournamentFundingCutoffs").doc(id).get()).exists, false);
  await db.collection("tournaments").doc(id).update({ status: "active" });
  await processAt("2026-10-10T12:01:59.999Z");
  equal((await db.collection("tournamentFundingCutoffs").doc(id).get()).exists, false);
  await Promise.all([processAt("2026-10-10T12:02:00.000Z"), processAt("2026-10-10T12:02:00.000Z")]);
  const cutoff = db.collection("tournamentFundingCutoffs").doc(id);
  equal((await cutoff.get()).data().firstVotingOpenedAt, "2026-10-10T12:02:00.000Z");
  equal((await db.collection("tournamentMatches").doc(first).get()).data().votingClosesAt, "2026-10-13T12:02:00.000Z");
  await db.collection("tournaments").doc(id).update({ status: "paused" });
  await processAt("2026-10-13T12:02:00.000Z");
  equal((await db.collection("tournamentMatches").doc(first).get()).data().status, "voting_open");
  equal((await db.collection("tournamentMatches").doc(second).get()).data().status, "submissions_open");
  await db.collection("tournaments").doc(id).update({ status: "active" });
  await processAt("2026-10-10T12:03:00.000Z");
  equal((await db.collection("tournamentMatches").doc(second).get()).data().status, "voting_open");
  equal((await cutoff.get()).data().firstVotingOpenedAt, "2026-10-10T12:02:00.000Z");
  const current = (await db.collection("tournaments").doc(id).get()).data();
  equal((await readTournamentSponsorVotingEvidence(db, undefined, id, current)).firstVotingOpenedAt, current.firstVotingOpenedAt);
  await db.collection("tournaments").doc(id).update({ firstVotingOpenedAt: "2026-10-10T12:04:00.000Z", tournamentVotingCutoffAt: "2026-10-10T12:04:00.000Z" });
  equal((await readTournamentSponsorVotingEvidence(db, undefined, id, (await db.collection("tournaments").doc(id).get()).data())).firstVotingOpenedAt, "invalid");
  equal((await cutoff.get()).data().firstVotingOpenedAt, "2026-10-10T12:02:00.000Z");
  console.log(`First actual Tournament voting cutoff: ${assertions} lifecycle/Firestore assertions passed.`);
} finally { await db.terminate(); }
