import { getAdminDb } from "@/lib/firebase/admin";
import { fail, ok, serverError, serverUnavailable } from "@/lib/server/responses";
import { buildChallengeLeaderboard } from "@/lib/server/leaderboard";
import { enrichWinnerRecord } from "@/lib/server/winners";
import { toPublicProfile } from "@/lib/server/public-profile";
import { isPublicChallenge } from "@/lib/server/public-challenge";

export const dynamic = "force-dynamic";

async function findWinnerResult(db: NonNullable<ReturnType<typeof getAdminDb>>, id: string) {
  const winnerSnap = await db.collection("winners").doc(id).get();
  if (!winnerSnap.exists) return null;
  const winner = await enrichWinnerRecord(db, { id: winnerSnap.id, ...winnerSnap.data() }, "stored");
  const challenge = winner.challenge ?? {};
  const challengeStatus = String(challenge.status ?? challenge.lifecycleStatus ?? "").toLowerCase();
  if (!["announced", "paid"].includes(winner.status)) return null;
  if (!["winners_announced", "completed"].includes(challengeStatus)) return null;
  if (!isPublicChallenge(winner.challengeId, challenge)) return null;
  return winner;
}
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const db = getAdminDb();
  if (!db) return serverUnavailable("Winner details");

  try {
    const winner = await findWinnerResult(db, id);
    if (!winner) return fail("Winner not found.", 404, undefined, "NOT_FOUND");

    const [challengeSnap, profileSnap, leaderboardResult] = await Promise.all([
      winner.challengeId ? db.collection("challenges").doc(winner.challengeId).get() : Promise.resolve(null),
      winner.userId ? db.collection("profiles").doc(winner.userId).get() : Promise.resolve(null),
      winner.challengeId ? buildChallengeLeaderboard(db, winner.challengeId, { limit: 5 }) : Promise.resolve(null)
    ]);
    const challenge = challengeSnap?.exists ? { id: challengeSnap.id, ...challengeSnap.data() } : winner.challenge ?? null;
    const profile = profileSnap?.exists ? toPublicProfile(profileSnap.id, profileSnap.data() ?? {}) : null;
    const leaderboard = leaderboardResult?.visible ? leaderboardResult.entries : [];

    return ok({
      winner,
      challenge,
      profile,
      leaderboard,
      resultStatus: winner.status,
      resultMessage: winner.resultMessage,
      payoutStatus: winner.payoutStatus,
      payoutActive: false
    }, "Winner details loaded.");
  } catch (error) {
    console.error("[winner-detail] load failed", { id, message: error instanceof Error ? error.message : String(error) });
    return serverError("Winner details could not be loaded.", error instanceof Error ? error.message : error);
  }
}

