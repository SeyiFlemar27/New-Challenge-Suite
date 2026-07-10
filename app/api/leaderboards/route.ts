import { getAdminDb } from "@/lib/firebase/admin";
import { buildChallengeLeaderboard, buildGlobalLeaderboard } from "@/lib/server/leaderboard";
import { fail, ok, serverError, serverUnavailable, validationError } from "@/lib/server/responses";
import { isPublicChallenge } from "@/lib/server/public-challenge";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const db = getAdminDb();
  if (!db) return serverUnavailable("Leaderboards");
  const url = new URL(request.url);
  const board = (url.searchParams.get("board") ?? "global").toLowerCase();
  const type = (url.searchParams.get("type") ?? (board === "challenge" ? "challenge" : "global")).toLowerCase();
  const challengeId = url.searchParams.get("challengeId") ?? url.searchParams.get("id") ?? "";
  const limit = Math.min(Math.max(Number(url.searchParams.get("limit") ?? 50), 1), 100);

  try {
    if (type === "challenge") {
      if (!challengeId) return validationError({ challengeId: "Challenge ID is required for challenge leaderboards." });
      const result = await buildChallengeLeaderboard(db, challengeId, { limit });
      if (!result.challenge) return fail("Challenge not found.", 404, undefined, "NOT_FOUND");
      if (!isPublicChallenge(challengeId, result.challenge)) {
        return fail("Challenge not found.", 404, undefined, "NOT_FOUND");
      }
      const { challenge: _challenge, ...payload } = result;
      return ok(payload, result.message ?? "Challenge leaderboard loaded.");
    }

    if (type === "tournament") {
      return fail("Tournament leaderboards are not available yet.", 501, undefined, "TOURNAMENT_LEADERBOARDS_LOCKED");
    }

    const result = await buildGlobalLeaderboard(db, limit);
    return ok(result, result.message ?? "Leaderboard loaded.");
  } catch (error) {
    console.error("[leaderboards] load failed", { board, type, challengeId, message: error instanceof Error ? error.message : String(error) });
    return serverError("Leaderboard could not be loaded.", error instanceof Error ? error.message : error);
  }
}
