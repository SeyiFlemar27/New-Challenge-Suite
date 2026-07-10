import { getAdminDb } from "@/lib/firebase/admin";
import { requireRequestUser } from "@/lib/server/auth";
import { ok, serverUnavailable } from "@/lib/server/responses";
import { FREE_BASIC_CHALLENGE_LIFETIME_LIMIT, freeBasicRemaining, freeBasicUsage } from "@/lib/server/free-challenge-limits";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const { user, response } = await requireRequestUser(request);
  if (response) return response;
  const db = getAdminDb();
  if (!db) return serverUnavailable("Challenge usage");
  const snap = await db.collection("challenges").where("creatorId", "==", user.uid).limit(200).get();
  const used = freeBasicUsage(snap.docs);
  return ok({
    freeBasic: {
      used,
      limit: FREE_BASIC_CHALLENGE_LIFETIME_LIMIT,
      remaining: freeBasicRemaining(used),
      rule: "lifetime"
    }
  }, "Challenge usage loaded.");
}
