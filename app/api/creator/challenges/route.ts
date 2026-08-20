import { getAdminDb } from "@/lib/firebase/admin";
import { requireRequestUser } from "@/lib/server/auth";
import { creatorChallengeCounts, creatorChallengeTab } from "@/lib/creator-challenges";
import { ok, serverError, serverUnavailable } from "@/lib/server/responses";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const { user, response } = await requireRequestUser(request);
  if (response) return response;
  const db = getAdminDb();
  if (!db) return serverUnavailable("Creator challenges");

  try {
    const ownershipFields = ["creatorId", "ownerId", "hostId", "userId"] as const;
    const snapshots = await Promise.all(ownershipFields.map((field) => db.collection("challenges").where(field, "==", user.uid).get()));
    const challenges = [...new Map(snapshots.flatMap((snapshot) => snapshot.docs.map((doc) => [doc.id, { id: doc.id, ...doc.data() } as Record<string, unknown>] as const))).values()]
      .filter((challenge) => challenge.deleted !== true && String(challenge.status ?? "").toLowerCase() !== "deleted")
      .sort((left, right) => String(right.updatedAt ?? right.createdAt ?? "").localeCompare(String(left.updatedAt ?? left.createdAt ?? "")))
      .map((challenge) => ({ ...challenge, productStatusGroup: creatorChallengeTab(challenge) }));
    return ok({ challenges, counts: creatorChallengeCounts(challenges), total: challenges.length }, "Creator challenges loaded.");
  } catch (error) {
    return serverError("Creator challenges could not be loaded.", error instanceof Error ? error.message : error);
  }
}
