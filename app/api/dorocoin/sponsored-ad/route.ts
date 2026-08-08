import { getAdminDb } from "@/lib/firebase/admin";
import { requireRequestUser } from "@/lib/server/auth";
import { awardDoroCoinEngagement } from "@/lib/server/economy-dorocoin";
import { ok, readJson, serverUnavailable, validationError, fail } from "@/lib/server/responses";

export async function POST(request: Request) {
  const { user, response } = await requireRequestUser(request);
  if (response) return response;
  const parsed = await readJson(request);
  if (parsed.response) return parsed.response;
  const providerEventId = String(parsed.body?.providerEventId ?? "").trim();
  if (!providerEventId) return validationError({ providerEventId: "A provider-confirmed advertisement event is required." });
  const db = getAdminDb();
  if (!db) return serverUnavailable("Sponsored advertisement rewards");
  const eventRef = db.collection("rewardedAdProviderEvents").doc(providerEventId);
  const event = await eventRef.get();
  const data = event.data() ?? {};
  if (!event.exists || data.userId !== user.uid || data.providerVerified !== true || data.completionStatus !== "completed") {
    return fail("Sponsored advertisement reward is awaiting provider confirmation.", 409, undefined, "PROVIDER_VERIFICATION_REQUIRED");
  }
  const reward = await awardDoroCoinEngagement(db, { userId: user.uid, sourceType: "sponsored_ad_watch", actionId: providerEventId, providerVerified: true, rewardAmount: Number(data.rewardAmount ?? 5), suspiciousSignals: Array.isArray(data.suspiciousSignals) ? data.suspiciousSignals.map(String) : [] });
  await eventRef.set({ rewardTransactionId: reward.id, rewardStatus: "credited", rewardedAt: new Date().toISOString(), updatedAt: new Date().toISOString() }, { merge: true });
  return ok({ reward }, "Provider-confirmed sponsored advertisement reward credited.");
}
