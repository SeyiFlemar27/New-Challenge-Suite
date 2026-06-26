import { getAdminDb } from "@/lib/firebase/admin";
import { fail, ok, serverError, serverUnavailable } from "@/lib/server/responses";
import { buildChallengeLeaderboard } from "@/lib/server/leaderboard";
import { deriveSafePreviewWinners, enrichWinnerRecord, normalizeWinnerRecord } from "@/lib/server/winners";

export const dynamic = "force-dynamic";

async function findWinnerResult(db: NonNullable<ReturnType<typeof getAdminDb>>, id: string) {
  const winnerSnap = await db.collection("winners").doc(id).get();
  if (winnerSnap.exists) return enrichWinnerRecord(db, { id: winnerSnap.id, ...winnerSnap.data() }, "stored");

  const submissionSnap = await db.collection("submissions").doc(id).get();
  if (submissionSnap.exists) {
    const submission = { id: submissionSnap.id, ...submissionSnap.data() } as Record<string, unknown>;
    const challengeId = String(submission.challengeId ?? "");
    const [challengeSnap, profileSnap, leaderboard] = await Promise.all([
      challengeId ? db.collection("challenges").doc(challengeId).get() : Promise.resolve(null),
      submission.userId ? db.collection("profiles").doc(String(submission.userId)).get() : Promise.resolve(null),
      challengeId ? buildChallengeLeaderboard(db, challengeId, { limit: 3 }) : Promise.resolve(null)
    ]);
    const row = leaderboard?.entries.find((entry) => entry.submissionId === id || entry.id === id) ?? null;
    if (!row && submission.isWinner !== true && submission.status !== "winner") return null;
    return normalizeWinnerRecord({
      winner: {
        id,
        challengeId,
        submissionId: id,
        userId: submission.userId,
        position: row?.rank ?? 1,
        rank: row?.rank ?? 1,
        status: submission.status === "winner" || submission.isWinner === true ? "announced" : "pending_review",
        payoutStatus: "not_applicable",
        prizeAmount: null,
        currency: null,
        createdAt: submission.createdAt,
        updatedAt: submission.updatedAt
      },
      submission,
      challenge: challengeSnap?.exists ? { id: challengeSnap.id, ...challengeSnap.data() } : null,
      profile: profileSnap?.exists ? { id: profileSnap.id, ...profileSnap.data() } : null,
      row,
      source: "submission_flag"
    });
  }

  const previews = await deriveSafePreviewWinners(db, 24);
  return previews.find((winner) => winner.id === id || winner.submissionId === id) ?? null;
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
    const profile = profileSnap?.exists ? { id: profileSnap.id, ...profileSnap.data() } : null;
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

