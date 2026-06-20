import { getAdminDb } from "@/lib/firebase/admin";
import { fail, ok, serverError, serverUnavailable } from "@/lib/server/responses";

export const dynamic = "force-dynamic";

async function findSubmissionOrWinner(db: NonNullable<ReturnType<typeof getAdminDb>>, id: string) {
  const submissionSnap = await db.collection("submissions").doc(id).get();
  if (submissionSnap.exists) return { id: submissionSnap.id, ...submissionSnap.data() };
  const winnerSnap = await db.collection("winners").doc(id).get();
  if (!winnerSnap.exists) return null;
  const winner = { id: winnerSnap.id, ...winnerSnap.data() } as Record<string, unknown>;
  const submissionId = String(winner.submissionId ?? "");
  if (!submissionId) return winner;
  const linkedSubmissionSnap = await db.collection("submissions").doc(submissionId).get();
  return linkedSubmissionSnap.exists ? { id: linkedSubmissionSnap.id, ...linkedSubmissionSnap.data(), ...winner } : winner;
}

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const db = getAdminDb();
  if (!db) return serverUnavailable("Winner details");

  try {
    const winner = await findSubmissionOrWinner(db, id);
    if (!winner) return fail("Winner not found.", 404, undefined, "NOT_FOUND");

    const challengeId = String(winner.challengeId ?? "");
    const userId = String(winner.userId ?? "");
    const [challengeSnap, profileSnap] = await Promise.all([
      challengeId ? db.collection("challenges").doc(challengeId).get() : Promise.resolve(null),
      userId ? db.collection("profiles").doc(userId).get() : Promise.resolve(null)
    ]);
    const challenge = challengeSnap?.exists ? { id: challengeSnap.id, ...challengeSnap.data() } : null;
    const profile = profileSnap?.exists ? { id: profileSnap.id, ...profileSnap.data() } : null;
    const leaderboardSnap = challengeId
      ? await db.collection("submissions").where("challengeId", "==", challengeId).limit(20).get()
      : null;
    const leaderboard = leaderboardSnap?.docs
      .map((doc) => ({ id: doc.id, ...doc.data() }))
      .sort((a, b) => Number((b as any).weightedVoteCount ?? (b as any).voteCount ?? 0) - Number((a as any).weightedVoteCount ?? (a as any).voteCount ?? 0))
      .slice(0, 5)
      .map((entry, index) => ({ ...entry, rank: index + 1 })) ?? [];

    return ok({ winner, challenge, profile, leaderboard }, "Winner details loaded.");
  } catch (error) {
    console.error("[winner-detail] load failed", { id, message: error instanceof Error ? error.message : String(error) });
    return serverError("Winner details could not be loaded.", error instanceof Error ? error.message : error);
  }
}
