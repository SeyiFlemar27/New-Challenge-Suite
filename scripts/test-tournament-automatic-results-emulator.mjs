import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { initializeApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import { ensureTournamentMatchLifecycleJobs, processTournamentMatchLifecycleJobById } from "../lib/server/tournament-match-lifecycle-jobs.ts";
import { confirmScheduledTournamentResult, confirmTournamentResult } from "../lib/server/tournament-result-confirmation.ts";

assert.match(process.env.GCLOUD_PROJECT ?? "", /^demo-/);
assert.match(process.env.FIRESTORE_EMULATOR_HOST ?? "", /^127\.0\.0\.1:\d+$/);
const app = initializeApp({ projectId: process.env.GCLOUD_PROJECT });
const db = getFirestore(app);
const run = `automatic_${randomUUID()}`;
const tournaments = [];
let assertions = 0;
function equal(actual, expected, message) { assert.equal(actual, expected, message); assertions++; }
async function fixture(label, options = {}) {
  const id = `${run}_${label}`;
  tournaments.push(id);
  const matchId = `${id}_match`;
  const nextId = `${id}_next`;
  const roundId = `${id}_round`;
  const closes = new Date(Date.now() - 1000).toISOString();
  await db.collection("tournaments").doc(id).set({ id, configVersion: 3, hostId: "host", status: "round_active", format: "single_elimination", participationMode: "individual", resultMethod: "votes", submissionDurationHours: 48, votingDurationHours: 72, ...options });
  await db.collection("tournamentRounds").doc(roundId).set({ id: roundId, tournamentId: id, status: "active" });
  await db.collection("tournamentMatches").doc(matchId).set({ id: matchId, tournamentId: id, roundId, status: "voting_open", resultMethod: "votes", participantAId: `${id}_a`, participantBId: `${id}_b`, voteCountA: 1, voteCountB: 1, voteSequence: 2, tiePrioritySlot: "B", votingClosesAt: closes, nextMatchId: nextId, nextSlot: "A" });
  await db.collection("tournamentMatches").doc(nextId).set({ id: nextId, tournamentId: id, roundId, status: "scheduled", resultMethod: "votes", participantAId: null, participantBId: `${id}_c` });
  for (const side of ["a", "b", "c"]) await db.collection("tournamentParticipants").doc(`${id}_${side}`).set({ tournamentId: id, userId: side, status: "active", lossCount: 0 });
  for (let index = 0; index < 2; index++) await db.collection("tournamentVotes").doc(`${id}_${index}`).set({ tournamentId: id, matchId, voteSequence: index + 1, selectedParticipantId: `${id}_${index ? "b" : "a"}`, status: "recorded" });
  await ensureTournamentMatchLifecycleJobs(db, id);
  const jobs = await db.collection("tournamentJobs").where("tournamentId", "==", id).get();
  return { id, matchId, nextId, jobId: jobs.docs[0].id };
}
try {
  const first = await fixture("concurrent");
  equal((await confirmScheduledTournamentResult(db, first.id, first.matchId, { id: "missing", version: 1 })).status, 409, "Worker capability requires a real leased job");
  equal((await confirmTournamentResult(db, first.id, { matchId: first.matchId, workerJob: { id: first.jobId, version: 1 } }, { uid: "unrelated" })).status, 403, "JSON cannot grant a worker capability");
  await Promise.all([processTournamentMatchLifecycleJobById(db, first.jobId, 1), processTournamentMatchLifecycleJobById(db, first.jobId, 1)]);
  const current = (await db.collection("tournamentMatches").doc(first.matchId).get()).data();
  equal(current.status, "confirmed");
  equal(current.winnerParticipantId, `${first.id}_a`, "Verified vote sequence resolves the tie");
  equal(current.confirmedBy, "system_tournament_lifecycle");
  equal((await db.collection("tournamentParticipants").doc(`${first.id}_b`).get()).data().lossCount, 1, "Concurrent delivery applies one loss");
  const next = (await db.collection("tournamentMatches").doc(first.nextId).get()).data();
  equal(next.participantAId, `${first.id}_a`);
  equal(next.status, "submissions_open");
  equal((await processTournamentMatchLifecycleJobById(db, first.jobId, 1)).code, "JOB_ALREADY_PROCESSED");
  const held = await fixture("held", { financialHold: true });
  await assert.rejects(processTournamentMatchLifecycleJobById(db, held.jobId, 1), /TOURNAMENT_FINANCIAL_HOLD/); assertions++;
  equal((await db.collection("tournamentMatches").doc(held.matchId).get()).data().winnerParticipantId, undefined);
  equal((await db.collection("tournamentJobs").doc(held.jobId).get()).data().status, "pending");
  await db.collection("tournaments").doc(held.id).update({ financialHold: false });
  await processTournamentMatchLifecycleJobById(db, held.jobId, 1);
  equal((await db.collection("tournamentMatches").doc(held.matchId).get()).data().status, "confirmed", "A closed-match retry recovers after an externally resolved hold");
  equal((await db.collection("tournamentExceptions").doc(`${held.matchId}_result_verification`).get()).data().status, "resolved", "successful recovery closes only the recorded result-verification exception");
  console.log(`Automatic Tournament results: ${assertions} emulator assertions passed.`);
} finally {
  const writer = db.bulkWriter();
  for (const id of tournaments) {
    for (const collection of ["tournamentMatches", "tournamentRounds", "tournamentParticipants", "tournamentVotes", "tournamentJobs", "tournamentAuditEvents", "tournamentExceptions"]) {
      const rows = await db.collection(collection).where("tournamentId", "==", id).get();
      rows.docs.forEach(doc => writer.delete(doc.ref));
    }
    writer.delete(db.collection("tournaments").doc(id));
  }
  await writer.close();
  await app.delete();
}
