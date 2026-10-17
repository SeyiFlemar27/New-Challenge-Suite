import type { Firestore, QueryDocumentSnapshot } from "firebase-admin/firestore";

/** Forming teams must not truncate confirmed entrants in a full 128-slot field. */
export async function loadTournamentTeamDirectory(db: Firestore, tournamentId: string) {
  const query = db.collection("tournamentTeams").where("tournamentId", "==", tournamentId);
  const docs: QueryDocumentSnapshot[] = [];
  let cursor: QueryDocumentSnapshot | undefined;
  for (;;) {
    const page = await (cursor ? query.startAfter(cursor) : query).limit(100).get();
    docs.push(...page.docs);
    if (page.size < 100) break;
    cursor = page.docs[page.docs.length - 1];
  }
  return { docs };
}
