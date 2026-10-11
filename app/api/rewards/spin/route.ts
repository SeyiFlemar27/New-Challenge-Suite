import { getAdminDb } from "@/lib/firebase/admin";
import { requireRequestUser } from "@/lib/server/auth";
import { executeRewardSpin, type RewardSpinTier } from "@/lib/server/rewards";
import { rewardSpinMessages } from "@/lib/server/reward-spin-messages";
import { fail, ok, readJson, serverError, serverUnavailable } from "@/lib/server/responses";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const { user, response } = await requireRequestUser(request);
  if (response) return response;
  const db = getAdminDb();
  if (!db) return serverUnavailable("Rewards");
  const parsed = await readJson(request);
  if (parsed.response) return parsed.response;
  const tier = String(parsed.body?.tier ?? "basic") as RewardSpinTier;
  if (!["basic", "standard", "premium"].includes(tier)) return fail("Select a valid Spin tier.", 400, undefined, "INVALID_REWARD_TIER");
  try {
    return ok(await executeRewardSpin(db, { userId: user.uid, tier, displayedVersionId: String(parsed.body?.displayedVersionId ?? "").slice(0, 180), idempotencyKey: String(parsed.body?.idempotencyKey ?? "").slice(0, 140) || null, paymentSource: parsed.body?.paymentSource === "bonus_spin" ? "bonus_spin" : "points", bonusEntitlementId: typeof parsed.body?.bonusEntitlementId === "string" ? parsed.body.bonusEntitlementId : null }), "Spin confirmed. Your reward was selected securely.");
  } catch (error) {
    const code = error instanceof Error ? error.message : "SPIN_FAILED";
    return code in rewardSpinMessages ? fail(rewardSpinMessages[code], 409, undefined, code) : serverError("We could not complete this Spin. No Reward Points were charged.", code);
  }
}
