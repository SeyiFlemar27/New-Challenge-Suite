import { getAdminDb } from "@/lib/firebase/admin";
import { ok, serverUnavailable } from "@/lib/server/responses";
import { isPublicChallenge } from "@/lib/server/public-challenge";
import { enrichWinnerRecord } from "@/lib/server/winners";

export const dynamic = "force-dynamic";

export async function GET() {
  const db = getAdminDb();
  if (!db) return serverUnavailable("Winners");

  const winnerDocs = await db.collection("winners").orderBy("createdAt", "desc").limit(100).get().catch(() => null);
  if (!winnerDocs?.size) return ok({ winners: [] }, "No winners have been announced yet.");

  const records = await Promise.all(winnerDocs.docs.map((doc) => enrichWinnerRecord(db, { id: doc.id, ...doc.data() }, "stored")));
  const winners = records.filter((winner) => {
    const challenge = winner.challenge ?? {};
    const challengeStatus = String(challenge.status ?? challenge.lifecycleStatus ?? "").toLowerCase();
    return ["announced", "paid"].includes(winner.status)
      && ["winners_announced", "completed"].includes(challengeStatus)
      && isPublicChallenge(winner.challengeId, challenge);
  }).slice(0, 24);

  return ok({ winners }, winners.length ? "Winners loaded." : "No winners have been announced yet.");
}
