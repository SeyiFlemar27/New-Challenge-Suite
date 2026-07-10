import { getAdminDb } from "@/lib/firebase/admin";
import { fail, ok, serverError, serverUnavailable } from "@/lib/server/responses";
import { buildChallengeLeaderboard } from "@/lib/server/leaderboard";
import { toPublicProfile } from "@/lib/server/public-profile";
import { getOptionalRequestUser } from "@/lib/server/auth";
import { isPublicChallenge, isPublicSubmission, publicChallengeFields, publicSubmissionFields } from "@/lib/server/public-challenge";

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
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
    const [challengeSnap, profileSnap, leaderboard] = await Promise.all([
      challengeId ? db.collection("challenges").doc(challengeId).get() : Promise.resolve(null),
      userId ? db.collection("profiles").doc(userId).get() : Promise.resolve(null),
      challengeId ? buildChallengeLeaderboard(db, challengeId, { limit: 200 }) : Promise.resolve(null)
    ]);

    const challengeData = challengeSnap?.exists ? challengeSnap.data() ?? {} : null;
    const user = await getOptionalRequestUser(request);
    const publicAccess = Boolean(
      challengeSnap?.exists
      && challengeData
      && isPublicChallenge(challengeSnap.id, challengeData)
      && isPublicSubmission(submissionSnap.id, submission)
    );
    const ownerAccess = Boolean(user && (user.uid === userId || user.uid === String(challengeData?.creatorId ?? "")));
    if (!publicAccess && !ownerAccess) {
      return fail("Submission not found.", 404, undefined, "NOT_FOUND");
    }

    const challenge = challengeSnap?.exists && challengeData
      ? { id: challengeSnap.id, ...publicChallengeFields(challengeData) }
      : null;
    const creator = profileSnap?.exists ? toPublicProfile(profileSnap.id, profileSnap.data() ?? {}) : null;
    const rank = leaderboard?.entries.find((item) => item.submissionId === id || item.id === id)?.rank ?? null;

    return ok({
      submission: { id: submissionSnap.id, ...publicSubmissionFields(submission) },
      challenge,
      creator,
      participant: null,
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
