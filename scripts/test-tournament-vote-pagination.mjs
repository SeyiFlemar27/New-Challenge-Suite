import assert from "node:assert/strict";
import { createTournamentVoteSequenceVerifier } from "../lib/server/tournament-vote-sequence.ts";
import { verifyPersistedTournamentVotes } from "../lib/server/tournament-vote-verification.ts";

const match = { id: "match", tournamentId: "tournament", participantAId: "a", participantBId: "b", voteSequence: 12000, voteCountA: 6000, voteCountB: 6000, tiePrioritySlot: "B" };
const votes = Array.from({ length: 12000 }, (_, index) => ({ voteSequence: index + 1, status: "recorded", selectedParticipantId: index % 2 ? "b" : "a", matchId: match.id, tournamentId: match.tournamentId }));
let assertions = 0;
function equal(actual, expected) { assert.equal(actual, expected); assertions++; }
function verify(events, current = match) {
  const verifier = createTournamentVoteSequenceVerifier(current);
  events.forEach(event => verifier.accept(event));
  return verifier.finish();
}
equal(verify(votes).valid, true);
equal(verify(votes).winnerParticipantId, "a");
equal(verify(votes).totalVotes, 12000);
equal(verify(votes.slice(0, 5001)).valid, false);
equal(verify([...votes.slice(0, 1000), ...votes.slice(1001)]).code, "VOTE_EVENT_INTEGRITY_FAILED");
equal(verify([votes[0], ...votes]).code, "VOTE_EVENT_INTEGRITY_FAILED");
equal(verify(votes, { ...match, voteCountA: 6001 }).code, "VOTE_TALLY_MISMATCH");
equal(verify([{ ...votes[0], matchId: "other" }]).code, "VOTE_EVENT_INTEGRITY_FAILED");
equal(verify([{ ...votes[0], status: "reversed" }]).code, "VOTE_EVENT_INTEGRITY_FAILED");
equal(verify([], { ...match, voteSequence: 0, voteCountA: 0, voteCountB: 0 }).winnerParticipantId, "b");

let reads = 0;
let filters = [];
function pageQuery(offset = 0, count = 1000) {
  return {
    where(field, operator, value) { filters.push([field, operator, value]); return this; },
    orderBy(field, direction) { assert.deepEqual([field, direction], ["voteSequence", "asc"]); return this; },
    startAfter(cursor) { return pageQuery(cursor.index + 1, count); },
    limit(size) { equal(size, 1000); return pageQuery(offset, size); },
    async get() { reads++; const docs = votes.slice(offset, offset + count).map((event, index) => ({ index: offset + index, data: () => event })); return { docs, size: docs.length }; }
  };
}
const db = { collection(name) { equal(name, "tournamentVotes"); return pageQuery(); } };
const result = await verifyPersistedTournamentVotes(db, match);
equal(result.valid, true);
equal(reads, 13);
assert.deepEqual(filters, [["tournamentId", "==", "tournament"], ["matchId", "==", "match"]]); assertions++;
reads = 0;
const transactional = await verifyPersistedTournamentVotes(db, match, { get: query => query.get() });
equal(transactional.valid, true);
equal(reads, 13);
await assert.rejects(verifyPersistedTournamentVotes(db, match, { get: () => Promise.reject(new Error("read failed")) }), /read failed/); assertions++;
console.log(`Tournament vote pagination: ${assertions} assertions passed (deterministic adapter, not Firestore runtime).`);
