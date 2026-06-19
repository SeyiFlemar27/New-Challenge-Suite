import { getAdminDb } from "@/lib/firebase/admin";
import { requireRequestUser } from "@/lib/server/auth";
import { fail, forbidden, ok, serverUnavailable, readJson, validationError } from "@/lib/server/responses";
import { castVote } from "@/lib/server/voting";

export async function POST(request: Request) {
  const { user, response } = await requireRequestUser(request);
  if (response) return response;
  const parsed = await readJson(request);
  if (parsed.response) return parsed.response;
  const body = parsed.body;
  const challengeId = body.challengeId;
  const submissionId = body.submissionId;
  const voteMode = body.voteMode === "dorocoin" ? "dorocoin" : "free";
  if (!challengeId || !submissionId) {
    return validationError({
      ...(!challengeId ? { challengeId: "Challenge ID is required." } : {}),
      ...(!submissionId ? { submissionId: "Submission ID is required." } : {})
    });
  }

  const db = getAdminDb();
  if (!db) return serverUnavailable("Voting");

  const profileSnap = await db.collection("users").doc(user.uid).get();
  const planId = profileSnap.data()?.planId || "observer";
  if (voteMode === "dorocoin" && planId === "observer") {
    return forbidden("Paid DoroCoin voting requires a paid subscription plan.");
  }
  try {
    const vote = await castVote(db, { userId: user.uid, challengeId, submissionId, voteMode, planId });
    return ok({ vote }, voteMode === "dorocoin" ? "Paid vote counted. 1 DoroCoin was spent." : "Free vote counted.");
  } catch (error) {
    return fail(error instanceof Error ? error.message : "Vote could not be recorded.", 409, undefined, "VOTE_REJECTED");
  }
}
