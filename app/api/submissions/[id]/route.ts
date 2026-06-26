import { getAdminDb } from "@/lib/firebase/admin";
import { fail, ok, serverError, serverUnavailable } from "@/lib/server/responses";
import { buildChallengeLeaderboard } from "@/lib/server/leaderboard";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const db = getAdminDb();
  if (!db) return serverUnavailable("Submission details");

  try {
    const submissionSnap = await db.collection("submissions").doc(id).get();
    if (!submissionSnap.exists) {
      return fail("Submission not found.", 404, { fieldErrors: { id: "Submission does not exist." } }, "NOT_FOUND");
    }

    const submission = { id: submissionSnap.id, ...submissionSnap.data() } as Record<string, unknown>;
    const challengeId = String(submission.challengeId ?? "");
    const userId = String(submission.userId ?? "");
    const participantId = String(submission.participantId ?? (challengeId && userId ? `${challengeId}_${userId}` : ""));
    const [challengeSnap, profileSnap, participantSnap, leaderboard] = await Promise.all([
      challengeId ? db.collection("challenges").doc(challengeId).get() : Promise.resolve(null),
      userId ? db.collection("profiles").doc(userId).get() : Promise.resolve(null),
      participantId ? db.collection("challengeParticipants").doc(participantId).get() : Promise.resolve(null),
      challengeId ? buildChallengeLeaderboard(db, challengeId, { limit: 200 }) : Promise.resolve(null)
    ]);

    const challenge = challengeSnap?.exists ? { id: challengeSnap.id, ...challengeSnap.data() } : null;
    const creator = profileSnap?.exists ? { id: profileSnap.id, ...profileSnap.data() } : null;
    const participant = participantSnap?.exists ? { id: participantSnap.id, ...participantSnap.data() } : null;
    const rank = leaderboard?.entries.find((item) => item.submissionId === id || item.id === id)?.rank ?? null;

    return ok({
      submission,
      challenge,
      creator,
      participant,
      rank,
      leaderboard: leaderboard ? { status: leaderboard.status, visibilityMode: leaderboard.visibilityMode, visible: leaderboard.visible, message: leaderboard.message } : null,
      comments: []
    }, "Submission details loaded.");
  } catch (error) {
    console.error("[api/submissions/:id] detail query failed", {
      submissionId: id,
      error: error instanceof Error ? error.message : "unknown"
    });
    return serverError("Submission details could not be loaded.");
  }
}
