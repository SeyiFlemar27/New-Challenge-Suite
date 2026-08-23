import { getAdminDb } from "@/lib/firebase/admin";
import { buildChallengeLeaderboard, buildGlobalLeaderboard, buildTournamentLeaderboard } from "@/lib/server/leaderboard";
import { fail, ok, serverError, serverUnavailable, validationError } from "@/lib/server/responses";
import { isPublicChallenge } from "@/lib/server/public-challenge";
import { getOptionalRequestUser } from "@/lib/server/auth";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const db = getAdminDb();
  if (!db) return serverUnavailable("Leaderboards");
  const url = new URL(request.url);
  const board = (url.searchParams.get("board") ?? "global").toLowerCase();
  const type = (url.searchParams.get("type") ?? (board === "challenge" ? "challenge" : "global")).toLowerCase();
  const challengeId = url.searchParams.get("challengeId") ?? url.searchParams.get("id") ?? "";
  const page = Math.max(1, Number(url.searchParams.get("page") ?? 1) || 1);
  const limit = 36;
  const periodValue = url.searchParams.get("period") ?? "all";
  const period = periodValue === "week" || periodValue === "month" ? periodValue : "all";
  const viewer = await getOptionalRequestUser(request);

  try {
    if (type === "challenge") {
      if (!challengeId) return validationError({ challengeId: "Challenge ID is required for challenge leaderboards." });
      const result = await buildChallengeLeaderboard(db, challengeId, { page, pageSize: limit });
      if (!result.challenge) return fail("Challenge not found.", 404, undefined, "NOT_FOUND");
      if (!isPublicChallenge(challengeId, result.challenge)) {
        return fail("Challenge not found.", 404, undefined, "NOT_FOUND");
      }
      const { challenge: _challenge, ...payload } = result;
      return ok(payload, result.message ?? "Challenge leaderboard loaded.");
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
    console.error("[leaderboards] load failed", { board, type, challengeId, message: error instanceof Error ? error.message : String(error) });
    return serverError("Leaderboard could not be loaded.", error instanceof Error ? error.message : error);
  }
}
