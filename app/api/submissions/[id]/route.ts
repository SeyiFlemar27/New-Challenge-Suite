import { getAdminDb } from "@/lib/firebase/admin";
import { fail, ok, serverUnavailable } from "@/lib/server/responses";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const db = getAdminDb();
  if (!db) return serverUnavailable("Submission details");

  const submissionSnap = await db.collection("submissions").doc(id).get();
  if (!submissionSnap.exists) {
    return fail("Submission not found.", 404, { fieldErrors: { id: "Submission does not exist." } }, "NOT_FOUND");
  }

  const submission = { id: submissionSnap.id, ...submissionSnap.data() } as Record<string, unknown>;
  const challengeId = String(submission.challengeId ?? "");
  const userId = String(submission.userId ?? "");
  const [challengeSnap, profileSnap, submissionsSnap] = await Promise.all([
    challengeId ? db.collection("challenges").doc(challengeId).get() : Promise.resolve(null),
    userId ? db.collection("profiles").doc(userId).get() : Promise.resolve(null),
    challengeId ? db.collection("submissions").where("challengeId", "==", challengeId).orderBy("weightedVoteCount", "desc").limit(200).get() : Promise.resolve(null)
  ]);

  const challenge = challengeSnap?.exists ? { id: challengeSnap.id, ...challengeSnap.data() } : null;
  const creator = profileSnap?.exists ? { id: profileSnap.id, ...profileSnap.data() } : null;
  const rankedSubmissions = submissionsSnap ? submissionsSnap.docs.map((doc) => ({ id: doc.id, ...doc.data() }) as Record<string, unknown>) : [];
  const rank = rankedSubmissions.findIndex((item) => item.id === id) + 1;

  return ok({
    submission,
    challenge,
    creator,
    rank: rank > 0 ? rank : null,
    comments: []
  }, "Submission details loaded.");
}
