import { getAdminDb } from "@/lib/firebase/admin";
import { buildGlobalLeaderboard, buildTournamentLeaderboard } from "@/lib/server/leaderboard";
import { buildPublicChallengeParticipants } from "@/lib/server/challenge-participants";
import { fail, ok, serverError, serverUnavailable, validationError } from "@/lib/server/responses";
import { isPublicChallenge } from "@/lib/server/public-challenge";
import { getOptionalRequestUser } from "@/lib/server/auth";
import { challengeForPlanAccess, hasPublicVotingAccess } from "@/lib/server/challenge-access";
import { canAccessChallenge } from "@/lib/plan-access";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const db = getAdminDb();
  if (!db) return serverUnavailable("Leaderboards");
  const url = new URL(request.url);
  const board = (url.searchParams.get("board") ?? "global").toLowerCase();
  const type = (url.searchParams.get("type") ?? (board === "challenge" ? "challenge" : "global")).toLowerCase();
  const challengeId = url.searchParams.get("challengeId") ?? url.searchParams.get("id") ?? "";
  const requestedPage = Number(url.searchParams.get("page") ?? 1);
  if (!Number.isSafeInteger(requestedPage) || requestedPage < 1 || requestedPage > 10_000) return validationError({ page: "Page must be an integer between 1 and 10,000." });
  const page = requestedPage;
  const requestedLimit = Number(url.searchParams.get("pageSize") ?? 36);
  if (!Number.isSafeInteger(requestedLimit) || requestedLimit < 1) return validationError({ pageSize: "Page size must be a positive integer." });
  const limit = Math.min(36, requestedLimit);
  const periodValue = url.searchParams.get("period") ?? "all";
  const period = periodValue === "week" || periodValue === "month" ? periodValue : "all";
  const viewer = await getOptionalRequestUser(request);

  try {
    if (type === "challenge") {
      if (!challengeId) return validationError({ challengeId: "Challenge ID is required for challenge leaderboards." });
      const challengeSnap = await db.collection("challenges").doc(challengeId).get();
      if (!challengeSnap.exists) return fail("Challenge not found.", 404, undefined, "NOT_FOUND");
      const challengeData = { id: challengeSnap.id, ...challengeSnap.data() } as Record<string, unknown>;
      if (!viewer && !isPublicChallenge(challengeId, challengeData)) return fail("Challenge not found.", 404, undefined, "NOT_FOUND");
      let owner = false;
      let publicVotingOnly = false;
      if (viewer) {
        const [accountSnap, profileSnap, accessContext] = await Promise.all([
          db.collection("users").doc(viewer.uid).get(),
          db.collection("profiles").doc(viewer.uid).get(),
          challengeForPlanAccess(db, challengeData, viewer.uid)
        ]);
        const profile = { ...(profileSnap.data() ?? {}), ...(accountSnap.data() ?? {}) };
        owner = [challengeData.creatorId, challengeData.ownerId, challengeData.hostId, challengeData.userId].some((id) => String(id ?? "") === viewer.uid);
        publicVotingOnly = accessContext.privateOnly && !accessContext.hasAccessGrant && hasPublicVotingAccess(challengeData);
        if (accessContext.privateOnly && !accessContext.hasAccessGrant && !publicVotingOnly) return fail("Challenge not found.", 404, undefined, "NOT_FOUND");
        const access = canAccessChallenge(profile, publicVotingOnly ? { ...challengeData, visibility: "public" } : accessContext.challenge);
        if (!access.allowed) return fail("Challenge not found.", 404, undefined, "NOT_FOUND");
      }
      if (challengeData.hideParticipantList === true && !owner) {
        return ok({ type: "challenge", board: challengeId, challengeId, status: "hidden", visibilityMode: "private_review", visible: false, message: "Challenge standings are unavailable.", entries: [], source: "submissions", updatedAt: null, competitionMode: "public_voting", pagination: null }, "Challenge standings are unavailable.");
      }
      const result = await buildPublicChallengeParticipants(db, challengeId, {
        page,
        pageSize: limit,
        cursor: url.searchParams.get("cursor"),
        search: url.searchParams.get("search") ?? "",
        sort: url.searchParams.get("sort") === "newest" ? "newest" : "highest_votes"
      });
      if (!result.challenge) return fail("Challenge not found.", 404, undefined, "NOT_FOUND");
      const challenge = result.challenge;
      if (!result.participantDiscoveryAllowed) {
        return ok({ type: "challenge", board: challengeId, challengeId, status: result.leaderboard.status, visibilityMode: result.leaderboard.visibilityMode, visible: false, message: result.leaderboard.message, entries: [], source: "submissions", updatedAt: null, competitionMode: "public_voting", pagination: null }, result.leaderboard.message ?? "Challenge standings are unavailable.");
      }
      return ok({
        type: "challenge",
        board: challengeId,
        challengeId,
        challengeTitle: String(challenge.title ?? "Challenge"),
        status: result.leaderboard.status,
        visibilityMode: result.leaderboard.visibilityMode,
        visible: result.leaderboard.visible,
        hasVerifiedVotes: result.hasVerifiedVotes,
        exactVoteCountVisible: result.exactVoteCountVisible,
        message: result.leaderboard.message,
        entries: result.entries,
        source: "submissions",
        updatedAt: null,
        competitionMode: [challenge.winnerSelection, challenge.votingMode, challenge.scoringMode].some((value) => String(value ?? "").toLowerCase().includes("judge")) || challenge.judgeScoringEnabled === true ? "judges" : "public_voting",
        pagination: { ...result.pagination, eligibleTotal: result.eligibleTotal }
      }, result.leaderboard.message ?? "Challenge leaderboard loaded.");
    }

    if (type === "tournament") {
      if (!challengeId) return validationError({ challengeId: "Tournament ID is required." });
      const result = await buildTournamentLeaderboard(db, challengeId, { page, pageSize: limit });
      if (result.status === "archived") return fail("Tournament not found.", 404, undefined, "NOT_FOUND");
      return ok(result, result.message ?? "Tournament standings loaded.");
    }

    const result = await buildGlobalLeaderboard(db, { page, pageSize: limit, period, currentUserId: viewer?.uid ?? null });
    return ok(result, result.message ?? "Leaderboard loaded.");
  } catch (error) {
    if (error instanceof Error && error.message === "INVALID_CHALLENGE_LEADERBOARD_CURSOR") return validationError({ cursor: "Leaderboard cursor is invalid." });
    console.error("[leaderboards] load failed", { board, type, challengeId, message: error instanceof Error ? error.message : String(error) });
    return serverError("Leaderboard could not be loaded.", error instanceof Error ? error.message : error);
  }
}
