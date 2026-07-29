import { getAdminDb } from "@/lib/firebase/admin";
import { getOptionalRequestUser } from "@/lib/server/auth";
import { challengeForPlanAccess, userOwnsChallenge } from "@/lib/server/challenge-access";
import { buildPublicChallengeParticipants, type ParticipantSort } from "@/lib/server/challenge-participants";
import { getChallengePhaseSummary } from "@/lib/challenge-status";
import { canAccessChallenge } from "@/lib/plan-access";
import { isPublicChallenge, publicChallengeFields } from "@/lib/server/public-challenge";
import { isSponsorProfile } from "@/lib/server/submission-lifecycle";
import { fail, ok, serverUnavailable } from "@/lib/server/responses";
import { predictionAccessForViewer } from "@/lib/server/predictions";

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const db = getAdminDb();
  if (!db) return serverUnavailable("Challenge participants");
  const challengeSnap = await db.collection("challenges").doc(id).get();
  if (!challengeSnap.exists) return fail("Challenge not found.", 404, undefined, "NOT_FOUND");

  const challenge = { id: challengeSnap.id, ...challengeSnap.data() } as Record<string, unknown>;
  const user = await getOptionalRequestUser(request);
  if (!user && !isPublicChallenge(id, challenge)) return fail("Challenge not found.", 404, undefined, "NOT_FOUND");

  let profile: Record<string, unknown> = {};
  if (user) {
    const [accountSnap, profileSnap, accessContext] = await Promise.all([
      db.collection("users").doc(user.uid).get(),
      db.collection("profiles").doc(user.uid).get(),
      challengeForPlanAccess(db, challenge, user.uid)
    ]);
    profile = { ...(profileSnap.data() ?? {}), ...(accountSnap.data() ?? {}) };
    if (accessContext.privateOnly && !accessContext.hasAccessGrant) {
      return fail("A valid private challenge invite or approval is required.", 403, undefined, "PRIVATE_INVITE_REQUIRED");
    }
    const access = canAccessChallenge(profile, accessContext.challenge);
    if (!access.allowed) return fail("Plan access is required for this challenge.", 403, undefined, access.code ?? "PLAN_ACCESS_DENIED");
  }

  const url = new URL(request.url);
  const page = Number(url.searchParams.get("page") ?? 1);
  const pageSize = Number(url.searchParams.get("pageSize") ?? 12);
  const sort = url.searchParams.get("sort") === "newest" ? "newest" : "highest_votes";
  const result = await buildPublicChallengeParticipants(db, id, {
    search: url.searchParams.get("search") ?? "",
    sort: sort as ParticipantSort,
    page,
    pageSize
  });
  const phaseSummary = getChallengePhaseSummary(challenge, new Date(), { eligibleSubmissionCount: result.eligibleTotal });
  const ownerBlocked = Boolean(user && userOwnsChallenge(challenge, user.uid));
  const sponsorBlocked = isSponsorProfile(profile);
  const canVote = Boolean(user && phaseSummary.votingOpen && result.eligibleTotal > 0 && !ownerBlocked && !sponsorBlocked);
  const votingReason = !user
    ? "auth_required"
    : ownerBlocked
      ? "owner_blocked"
      : sponsorBlocked
        ? "sponsor_blocked"
        : !phaseSummary.votingOpen
          ? "voting_closed"
          : result.eligibleTotal <= 0
            ? "no_eligible_submissions"
            : null;
  const predictionAccess = predictionAccessForViewer({
    challengeId: id,
    challenge,
    userId: user?.uid ?? null,
    user,
    profile,
    eligibleSubmissionCount: result.eligibleTotal
  });

  return ok({
    challenge: { id, ...publicChallengeFields(challenge) },
    phaseSummary,
    participants: result.entries,
    pagination: result.pagination,
    eligibleSubmissionCount: result.eligibleTotal,
    filters: { search: result.search, sort: result.sort },
    leaderboard: result.leaderboard,
    votingAccess: {
      authenticated: Boolean(user),
      canVote,
      reason: votingReason,
      loginPath: `/auth/login?next=${encodeURIComponent(`/challenges/${id}/participants`)}`
    },
    predictionAccess,
    exactVoteCountVisible: result.exactVoteCountVisible
  }, "Challenge participants loaded.");
}
