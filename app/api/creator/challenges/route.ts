import { getAdminDb } from "@/lib/firebase/admin";
import { requireRequestUser } from "@/lib/server/auth";
import { creatorChallengeCounts, creatorChallengeTab } from "@/lib/creator-challenges";
import { ok, serverError, serverUnavailable } from "@/lib/server/responses";
import { CHALLENGE_PAGE_SIZE } from "@/lib/challenge-pagination";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const { user, response } = await requireRequestUser(request);
  if (response) return response;
  const db = getAdminDb();
  if (!db) return serverUnavailable("Creator challenges");

  try {
    const url = new URL(request.url);
    const page = Math.max(1, Number(url.searchParams.get("page") ?? 1) || 1);
    const tab = url.searchParams.get("tab") ?? "active";
    const search = String(url.searchParams.get("q") ?? "").trim().toLowerCase().slice(0, 80);
    const type = String(url.searchParams.get("type") ?? "").trim().toLowerCase();
    const sort = String(url.searchParams.get("sort") ?? "updated").trim().toLowerCase();
    const ownershipFields = ["creatorId", "ownerId", "hostId", "userId"] as const;
    const snapshots = await Promise.all(ownershipFields.map((field) => db.collection("challenges").where(field, "==", user.uid).get()));
    const allChallenges = [...new Map(snapshots.flatMap((snapshot) => snapshot.docs.map((doc) => [doc.id, { id: doc.id, ...doc.data() } as Record<string, unknown>] as const))).values()]
      .filter((challenge) => challenge.deleted !== true && String(challenge.status ?? "").toLowerCase() !== "deleted")
      .map((challenge): Record<string, unknown> & { productStatusGroup: ReturnType<typeof creatorChallengeTab> } => ({ ...challenge, productStatusGroup: creatorChallengeTab(challenge) }));
    const filtered = allChallenges.filter((challenge) => challenge.productStatusGroup === tab)
      .filter((challenge) => !search || `${challenge.title ?? ""} ${challenge.category ?? ""}`.toLowerCase().includes(search))
      .filter((challenge) => !type || String(challenge.challengeType ?? challenge.type ?? "normal").toLowerCase().includes(type))
      .sort((left, right) => sort === "oldest" ? String(left.updatedAt ?? left.createdAt ?? "").localeCompare(String(right.updatedAt ?? right.createdAt ?? "")) : sort === "title" ? String(left.title ?? "").localeCompare(String(right.title ?? "")) : String(right.updatedAt ?? right.createdAt ?? "").localeCompare(String(left.updatedAt ?? left.createdAt ?? "")));
    const start = (page - 1) * CHALLENGE_PAGE_SIZE;
    return ok({ challenges: filtered.slice(start, start + CHALLENGE_PAGE_SIZE), counts: creatorChallengeCounts(allChallenges), total: filtered.length, page, limit: CHALLENGE_PAGE_SIZE, filters: { tab, search, type, sort } }, "Creator challenges loaded.");
  } catch (error) {
    return serverError("Creator challenges could not be loaded.", error instanceof Error ? error.message : error);
  }
}
