import { getAdminDb } from "@/lib/firebase/admin";
import { requireRequestUser } from "@/lib/server/auth";
import { fail, ok, serverUnavailable, readJson, validationError } from "@/lib/server/responses";
import { castVote } from "@/lib/server/voting";
import { getUserPlanAccess } from "@/lib/plan-access";

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

  const [accountSnap, profileSnap] = await Promise.all([
    db.collection("users").doc(user.uid).get(),
    db.collection("profiles").doc(user.uid).get()
  ]);
  const planAccess = getUserPlanAccess({ ...(profileSnap.exists ? profileSnap.data() ?? {} : {}), ...(accountSnap.exists ? accountSnap.data() ?? {} : {}) });
  try {
    const vote = await castVote(db, { userId: user.uid, challengeId, submissionId, voteMode, planId: planAccess.planId, dailyFreeVoteLimit: planAccess.dailyFreeVoteLimit });
    return ok({ vote }, voteMode === "dorocoin" ? "Paid vote counted. 1 DoroCoin was spent." : "Free vote counted.");
  } catch (error) {
    return fail(error instanceof Error ? error.message : "Vote could not be recorded.", 409, undefined, "VOTE_REJECTED");
  }
}
