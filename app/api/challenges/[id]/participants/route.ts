import { getAdminDb } from "@/lib/firebase/admin";
import { getOptionalRequestUser } from "@/lib/server/auth";
import { challengeForPlanAccess, hasPublicVotingAccess, userOwnsChallenge } from "@/lib/server/challenge-access";
import { buildPublicChallengeParticipants, type ParticipantSort } from "@/lib/server/challenge-participants";
import { getChallengePhaseSummary } from "@/lib/challenge-status";
import { canAccessChallenge } from "@/lib/plan-access";
import { isPublicChallenge, publicChallengeFields } from "@/lib/server/public-challenge";
import { isSponsorProfile } from "@/lib/server/submission-lifecycle";
import { fail, ok, serverUnavailable, validationError } from "@/lib/server/responses";
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
  let publicVotingOnly = false;
  if (user) {
    const [accountSnap, profileSnap, accessContext] = await Promise.all([
      db.collection("users").doc(user.uid).get(),
      db.collection("profiles").doc(user.uid).get(),
      challengeForPlanAccess(db, challenge, user.uid)
    ]);
    profile = { ...(profileSnap.data() ?? {}), ...(accountSnap.data() ?? {}) };
    publicVotingOnly = accessContext.privateOnly && !accessContext.hasAccessGrant && hasPublicVotingAccess(challenge);
    if (accessContext.privateOnly && !accessContext.hasAccessGrant && !publicVotingOnly) {
      return fail("A valid private challenge invite or approval is required.", 403, undefined, "PRIVATE_INVITE_REQUIRED");
    }
    const access = canAccessChallenge(profile, publicVotingOnly ? { ...challenge, visibility: "public" } : accessContext.challenge);
    if (!access.allowed) return fail("Plan access is required for this challenge.", 403, undefined, access.code ?? "PLAN_ACCESS_DENIED");
  }

  const url = new URL(request.url);
  const page = Number(url.searchParams.get("page") ?? 1);
  const pageSize = Number(url.searchParams.get("pageSize") ?? 12);
  if (!Number.isSafeInteger(page) || page < 1 || page > 10_000) return validationError({ page: "Page must be an integer between 1 and 10,000." });
  if (!Number.isSafeInteger(pageSize) || pageSize < 1 || pageSize > 48) return validationError({ pageSize: "Page size must be an integer between 1 and 48." });
  const sort = url.searchParams.get("sort") === "newest" ? "newest" : "highest_votes";
  let result: Awaited<ReturnType<typeof buildPublicChallengeParticipants>>;
  try {
    result = await buildPublicChallengeParticipants(db, id, {
      search: url.searchParams.get("search") ?? "",
      sort: sort as ParticipantSort,
      page,
      pageSize,
      cursor: url.searchParams.get("cursor")
    });
  } catch (error) {
    if (error instanceof Error && error.message === "INVALID_CHALLENGE_LEADERBOARD_CURSOR") return validationError({ cursor: "Leaderboard cursor is invalid." });
    throw error;
  }
  const phaseSummary = getChallengePhaseSummary(challenge, new Date(), { eligibleSubmissionCount: result.eligibleTotal });
  const ownerBlocked = Boolean(user && userOwnsChallenge(challenge, user.uid));
  const hideParticipantList = challenge.hideParticipantList === true && !ownerBlocked;
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
    challenge: publicVotingOnly
      ? { id, title: challenge.title ?? "Private Challenge", category: challenge.category ?? null, status: challenge.status ?? null, votingDeadline: challenge.votingDeadline ?? challenge.votingEndsAt ?? null, timeZone: challenge.timeZone ?? challenge.timezone ?? "UTC" }
      : { id, ...publicChallengeFields(challenge, id) },
    phaseSummary,
    participants: hideParticipantList ? [] : result.entries,
    pagination: hideParticipantList ? { ...result.pagination, total: null, hasMore: false, nextCursor: null } : result.pagination,
    eligibleSubmissionCount: hideParticipantList ? null : result.eligibleTotal,
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
