import { getAdminDb } from "@/lib/firebase/admin";
import { requireRequestUser } from "@/lib/server/auth";
import { fail, ok, serverUnavailable, readJson, validationError } from "@/lib/server/responses";
import { castVote } from "@/lib/server/voting";
import { canAccessChallenge, getUserPlanAccess } from "@/lib/plan-access";
import { voteRequestSchema, zodFieldErrors } from "@/lib/server/vote-validation";
import { suspiciousVoteSignals, voteSignalHashes } from "@/lib/server/fraud-signals";
import { getRequestIdempotencyKey } from "@/lib/server/idempotency";
import { challengeForPlanAccess } from "@/lib/server/challenge-access";
import { consumeRateLimit } from "@/lib/server/rate-limit";

export async function POST(request: Request) {
  const { user, response } = await requireRequestUser(request);
  if (response) return response;

  const parsed = await readJson(request);
  if (parsed.response) return parsed.response;
  const voteInput = voteRequestSchema.safeParse(parsed.body ?? {});
  if (!voteInput.success) return validationError(zodFieldErrors(voteInput.error));
  const body = voteInput.data;
  const requestIdempotencyKey = getRequestIdempotencyKey(request, parsed.body);
  const rateLimit = consumeRateLimit(`vote:${user.uid}`, { limit: 20, windowMs: 60_000 });
  if (!rateLimit.allowed) return fail("Too many voting attempts. Please wait before trying again.", 429, { retryAfterSeconds: rateLimit.retryAfterSeconds }, "RATE_LIMITED");

  const db = getAdminDb();
  if (!db) return serverUnavailable("Voting");

  try {
    const [accountSnap, profileSnap] = await Promise.all([
      db.collection("users").doc(user.uid).get(),
      db.collection("profiles").doc(user.uid).get()
    ]);
    const profile = { ...(profileSnap.exists ? profileSnap.data() ?? {} : {}), ...(accountSnap.exists ? accountSnap.data() ?? {} : {}) };
    const planAccess = getUserPlanAccess(profile);
    const challengeSnap = await db.collection("challenges").doc(body.challengeId).get();
    if (!challengeSnap.exists) return fail("Challenge not found.", 404, undefined, "NOT_FOUND");

    const challenge = { id: challengeSnap.id, ...challengeSnap.data() } as Record<string, unknown>;
    const accessContext = await challengeForPlanAccess(db, challenge, user.uid);
    if (accessContext.privateOnly && !accessContext.hasAccessGrant) {
      return fail("A valid private challenge invite or approval is required.", 403, { redirectTo: "/private-exclusive" }, "PRIVATE_INVITE_REQUIRED");
    }

    const challengeAccess = canAccessChallenge(profile, accessContext.challenge);
    if (!challengeAccess.allowed) {
      return fail(
        challengeAccess.code === "PREMIUM_REQUIRED" ? "Premium membership is required to vote on this challenge." : "Plan access is required for this challenge.",
        403,
        undefined,
        challengeAccess.code ?? "CHALLENGE_ACCESS_DENIED"
      );
    }

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
      requestIdempotencyKey,
      timeZone: String(profile.timeZone ?? profile.timezone ?? "UTC"),
      confirmedLargeSpend: body.confirmedLargeSpend
    });
    return ok({ vote: result.vote, votes: result.votes, quantity: result.quantity, coinCost: result.coinCost, walletTransactionId: result.walletTransactionId, voteDate: result.voteDate, timeZone: result.timeZone, freeVoteResetAt: result.freeVoteResetAt }, body.voteMode === "dorocoin" ? `${result.quantity} DoroCoin vote${result.quantity === 1 ? "" : "s"} counted.` : "Free vote counted.");
  } catch (error) {
    const err = error as Error & { code?: string };
    const status = err.code === "NOT_FOUND"
      ? 404
      : ["SPONSOR_ACCOUNT_BLOCKED", "CHALLENGE_OWNER_VOTING_BLOCKED"].includes(String(err.code))
        ? 403
        : 409;
    return fail(err.message || "Vote could not be recorded.", status, undefined, err.code ?? "VOTE_REJECTED");
  }
}
