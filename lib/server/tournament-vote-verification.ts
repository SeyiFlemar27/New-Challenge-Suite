import type { Firestore, QueryDocumentSnapshot, Transaction } from "firebase-admin/firestore";
import type { TournamentMatchFoundation } from "@/lib/tournament-types";
import { createTournamentVoteSequenceVerifier } from "@/lib/server/tournament-vote-sequence";

/** Read every event in bounded pages; the transaction caller also locks the match
 * counters updated by voting. A failed page or transaction never yields a result. */
export async function verifyPersistedTournamentVotes(db: Firestore, match: TournamentMatchFoundation, transaction?: Transaction) {
  const verifier = createTournamentVoteSequenceVerifier(match);
  const query = db.collection("tournamentVotes")
    .where("tournamentId", "==", match.tournamentId)
    .where("matchId", "==", match.id)
    .orderBy("voteSequence", "asc");
  let cursor: QueryDocumentSnapshot | undefined;
  const pageSize = 1000;
  for (;;) {
    const pageQuery = (cursor ? query.startAfter(cursor) : query).limit(pageSize);
    const page = transaction ? await transaction.get(pageQuery) : await pageQuery.get();
    for (const document of page.docs) verifier.accept(document.data());
    if (page.size < pageSize) break;
    cursor = page.docs[page.docs.length - 1];
  }
  return verifier.finish();
}
