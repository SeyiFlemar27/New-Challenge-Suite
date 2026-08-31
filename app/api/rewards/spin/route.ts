import { getAdminDb } from "@/lib/firebase/admin";
import { requireRequestUser } from "@/lib/server/auth";
import { executeRewardSpin, type RewardSpinTier } from "@/lib/server/rewards";
import { fail, ok, readJson, serverError, serverUnavailable } from "@/lib/server/responses";

export const dynamic = "force-dynamic";

export const rewardSpinMessages: Record<string, string> = {
  INSUFFICIENT_REWARD_POINTS: "You do not have enough Reward Points for this Spin.",
  BONUS_SPIN_UNAVAILABLE: "This Bonus Spin is no longer available.",
  BONUS_SPIN_EXPIRED: "This Bonus Spin has expired.",
  BONUS_SPIN_TIER_MISMATCH: "This Bonus Spin is not valid for the selected tier.",
  NO_AVAILABLE_PRIZES: "No eligible rewards are currently available for this tier.",
  WHEEL_DISABLED: "This Spin tier is paused right now.",
  REWARDS_DISABLED: "Rewards are unavailable right now.",
  REWARD_FULFILLMENT_PAUSED: "Spins are paused while reward fulfillment is under maintenance.",
  REWARDS_ACCOUNT_RESTRICTED: "Your Rewards account is restricted. You can still view your history.",
  REWARDS_ACCOUNT_NOT_ELIGIBLE: "This account context is not eligible for consumer Rewards.",
  REWARD_DEBT_ACTIVE: "New Spins are unavailable while a Reward Point correction is outstanding.",
  REWARD_POINT_RETURN_RATIO_BLOCKED: "This Spin configuration is paused for economic review.",
  PRIZE_OUT_OF_STOCK: "That reward became unavailable. No points were charged; please try again.",
  PRIZE_USER_WIN_LIMIT_REACHED: "You have reached the win limit for this reward. No points were charged.",
  PRIZE_DAILY_WIN_LIMIT_REACHED: "This reward reached its daily win limit. No points were charged; please try again.",
  REWARD_BUDGET_EXHAUSTED: "This reward budget is unavailable. No points were charged.",
  NO_ACTIVE_WHEEL_VERSION: "This Spin tier is temporarily unavailable. No points were charged.",
  WHEEL_VERSION_CHANGED: "This Spin tier was just updated. No points were charged; please try again."
};

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
    return ok(await executeRewardSpin(db, { userId: user.uid, tier, idempotencyKey: String(parsed.body?.idempotencyKey ?? "").slice(0, 140) || null, paymentSource: parsed.body?.paymentSource === "bonus_spin" ? "bonus_spin" : "points", bonusEntitlementId: typeof parsed.body?.bonusEntitlementId === "string" ? parsed.body.bonusEntitlementId : null }), "Spin confirmed. Your reward was selected securely.");
  } catch (error) {
    const code = error instanceof Error ? error.message : "SPIN_FAILED";
    return code in rewardSpinMessages ? fail(rewardSpinMessages[code], 409, undefined, code) : serverError("We could not complete this Spin. No Reward Points were charged.", code);
  }
}
