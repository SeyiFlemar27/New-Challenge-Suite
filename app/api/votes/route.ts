import { getAdminDb } from "@/lib/firebase/admin";
import { requireRequestUser } from "@/lib/server/auth";
import { fail, ok, serverUnavailable, readJson, validationError } from "@/lib/server/responses";
import { castVote } from "@/lib/server/voting";
import { getUserPlanAccess } from "@/lib/plan-access";
import { voteRequestSchema, zodFieldErrors } from "@/lib/server/vote-validation";
import { suspiciousVoteSignals, voteSignalHashes } from "@/lib/server/fraud-signals";
import { getRequestIdempotencyKey } from "@/lib/server/idempotency";

export async function POST(request: Request) {
  const { user, response } = await requireRequestUser(request);
  if (response) return response;

  const parsed = await readJson(request);
  if (parsed.response) return parsed.response;
  const voteInput = voteRequestSchema.safeParse(parsed.body ?? {});
  if (!voteInput.success) return validationError(zodFieldErrors(voteInput.error));
  const body = voteInput.data;
  const requestIdempotencyKey = getRequestIdempotencyKey(request, parsed.body);

  const db = getAdminDb();
  if (!db) return serverUnavailable("Voting");

  try {
    const [accountSnap, profileSnap] = await Promise.all([
      db.collection("users").doc(user.uid).get(),
      db.collection("profiles").doc(user.uid).get()
    ]);
    const profile = { ...(profileSnap.exists ? profileSnap.data() ?? {} : {}), ...(accountSnap.exists ? accountSnap.data() ?? {} : {}) };
    const planAccess = getUserPlanAccess(profile);
    const signalHashes = voteSignalHashes(request);
    const signals = suspiciousVoteSignals({ quantity: body.quantity, voteMode: body.voteMode });
    const result = await castVote(db, {
      userId: user.uid,
      challengeId: body.challengeId,
      submissionId: body.submissionId,
      voteMode: body.voteMode,
      quantity: body.quantity,
      planId: planAccess.normalizedPlanId,
      dailyFreeVoteLimit: planAccess.dailyFreeVoteLimit,
      profile: { ...profile, planId: planAccess.normalizedPlanId, accountType: planAccess.accountType },
      ipHash: signalHashes.ipHash,
      userAgentHash: signalHashes.userAgentHash,
      suspiciousSignals: signals,
      requestIdempotencyKey
    });
    return ok({ vote: result.vote, votes: result.votes, quantity: result.quantity, coinCost: result.coinCost, walletTransactionId: result.walletTransactionId }, body.voteMode === "dorocoin" ? `${result.quantity} DoroCoin vote${result.quantity === 1 ? "" : "s"} counted.` : "Free vote counted.");
  } catch (error) {
    const err = error as Error & { code?: string };
    const status = err.code === "NOT_FOUND" ? 404 : err.code === "SPONSOR_ACCOUNT_BLOCKED" ? 403 : 409;
    return fail(err.message || "Vote could not be recorded.", status, undefined, err.code ?? "VOTE_REJECTED");
  }
}
