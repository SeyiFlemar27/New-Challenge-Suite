import { getAdminDb } from "@/lib/firebase/admin";
import { ok, serverError, serverUnavailable } from "@/lib/server/responses";

export const dynamic = "force-dynamic";

function toIso(value: unknown): string | null {
  if (!value) return null;
  if (typeof value === "string") return value;
  if (value instanceof Date) return value.toISOString();
  if (typeof value === "object" && "toDate" in value && typeof value.toDate === "function") return value.toDate().toISOString();
  return null;
}

function rowFromProfile(doc: FirebaseFirestore.QueryDocumentSnapshot, index: number) {
  const data = doc.data();
  return {
    id: doc.id,
    rank: index + 1,
    userId: doc.id,
    displayName: data.displayName ?? data.name ?? "Challenge Suite Member",
    initials: data.initials ?? "CS",
    planId: data.planId ?? "free",
    badgeStyleId: data.customization?.profileBadgeId ?? undefined,
    points: Number(data.totalPoints ?? data.points ?? 0),
    wins: Number(data.wins ?? data.winnerCount ?? 0),
    votes: Number(data.voteCount ?? data.votesCast ?? 0),
    submissions: Number(data.submissionCount ?? 0),
    trend: data.trend ?? "steady"
  };
}

export async function GET(request: Request) {
  const db = getAdminDb();
  if (!db) return serverUnavailable("Leaderboards");
  const url = new URL(request.url);
  const board = (url.searchParams.get("board") ?? "global").toLowerCase();
  const limit = Math.min(Math.max(Number(url.searchParams.get("limit") ?? 50), 1), 100);

  try {
    const leaderboardDoc = await db.collection("leaderboards").doc(board).get();
    if (leaderboardDoc.exists && Array.isArray(leaderboardDoc.data()?.entries)) {
      const entries = (leaderboardDoc.data()?.entries as Record<string, unknown>[]).slice(0, limit).map((entry, index) => ({
        ...entry,
        rank: Number(entry.rank ?? index + 1),
        points: Number(entry.points ?? entry.score ?? 0),
        wins: Number(entry.wins ?? 0),
        votes: Number(entry.votes ?? 0),
        submissions: Number(entry.submissions ?? 0)
      }));
      return ok({ board, entries, source: "leaderboards", updatedAt: toIso(leaderboardDoc.data()?.updatedAt) }, "Leaderboard loaded.");
    }

    const profileSnap = await db.collection("profiles").limit(limit).get();
    const entries = profileSnap.docs
      .map(rowFromProfile)
      .sort((a, b) => b.points - a.points)
      .map((entry, index) => ({ ...entry, rank: index + 1 }));
    return ok({ board, entries, source: "profiles", updatedAt: null }, "Leaderboard loaded.");
  } catch (error) {
    console.error("[leaderboards] load failed", { board, message: error instanceof Error ? error.message : String(error) });
    return serverError("Leaderboard could not be loaded.", error instanceof Error ? error.message : error);
  }
}
