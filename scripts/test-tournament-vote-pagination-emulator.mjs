import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { initializeApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import { verifyPersistedTournamentVotes } from "../lib/server/tournament-vote-verification.ts";

const projectId = process.env.GCLOUD_PROJECT;
assert.match(projectId ?? "", /^demo-/);
assert.match(process.env.FIRESTORE_EMULATOR_HOST ?? "", /^127\.0\.0\.1:\d+$/);
const app = initializeApp({ projectId });
const db = getFirestore(app);
const id = `pagination_${randomUUID()}`;
const match = { id, tournamentId: id, participantAId: "a", participantBId: "b", voteSequence: 6002, voteCountA: 3001, voteCountB: 3001, tiePrioritySlot: "B" };
const ref = db.collection("tournamentMatches").doc(id);
try {
  await ref.set(match);
  for (let offset = 0; offset < match.voteSequence; offset += 400) {
    const batch = db.batch();
    for (let i = offset; i < Math.min(offset + 400, match.voteSequence); i++) batch.set(db.collection("tournamentVotes").doc(`${id}_${i}`), { tournamentId: id, matchId: id, voteSequence: i + 1, status: "recorded", selectedParticipantId: i % 2 ? "b" : "a" });
    await batch.commit();
  }
  const result = await db.runTransaction(async transaction => {
    const current = await transaction.get(ref);
    const verified = await verifyPersistedTournamentVotes(db, current.data(), transaction);
    assert.equal(verified.valid, true);
    assert.equal(verified.totalVotes, 6002);
    assert.equal(verified.winnerParticipantId, "a");
    transaction.update(ref, { verifiedVoteTotal: verified.totalVotes });
    return verified;
  });
  assert.equal(result.tied, true);
  assert.equal((await ref.get()).data().verifiedVoteTotal, 6002);
  await db.collection("tournamentVotes").doc(`${id}_1000`).update({ voteSequence: 1000 });
  assert.equal((await verifyPersistedTournamentVotes(db, match)).code, "VOTE_EVENT_INTEGRITY_FAILED");
  console.log("Tournament paginated Firestore verification: 6 assertions passed, including 6,002 events in an actual transaction and a duplicate across page boundaries.");
} finally {
  const writer = db.bulkWriter();
  const events = await db.collection("tournamentVotes").where("tournamentId", "==", id).get();
  for (const doc of events.docs) writer.delete(doc.ref);
  writer.delete(ref);
  await writer.close();
  await app.delete();
}
