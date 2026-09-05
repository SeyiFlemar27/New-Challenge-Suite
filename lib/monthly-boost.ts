import { getUserPlanAccess } from "@/lib/plan-access";

export const MONTHLY_BOOST_DURATION_HOURS = 72;
export const MONTHLY_BOOST_DURATION_MS = MONTHLY_BOOST_DURATION_HOURS * 60 * 60 * 1000;

export function monthlyBoostMonthKey(now = new Date()) {
  return `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}`;
}

export function monthlyBoostResetAt(now = new Date()) {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1)).toISOString();
}

function epochPart(value: unknown) {
  if (!value) return "current";
  if (value instanceof Date) return value.toISOString();
  if (typeof value === "object" && value && "toDate" in value && typeof (value as { toDate: () => Date }).toDate === "function") {
    return (value as { toDate: () => Date }).toDate().toISOString();
  }
  return String(value);
}

export function monthlyBoostEntitlementKey(profile: Record<string, unknown>, now = new Date()) {
  const plan = getUserPlanAccess(profile);
  const epoch = epochPart(profile.planEntitlementEpoch ?? profile.planActivatedAt ?? profile.planChangedAt ?? profile.subscriptionStartedAt);
  return `${monthlyBoostMonthKey(now)}:${plan.normalizedPlanId}:${epoch}`;
}

export function monthlyBoostEntitlement(profile: Record<string, unknown>, used: number, now = new Date()) {
  const plan = getUserPlanAccess(profile);
  const allowance = plan.planStatus === "active" || plan.planStatus === "trial" || plan.planStatus === "trialing" || plan.normalizedPlanId === "free"
    ? plan.monthlyBoostLimit
    : 0;
  const safeUsed = Math.max(0, Math.floor(Number.isFinite(used) ? used : 0));
  return {
    planId: plan.normalizedPlanId,
    planName: plan.planName,
    allowance,
    used: safeUsed,
    remaining: Math.max(0, allowance - safeUsed),
    resetAt: monthlyBoostResetAt(now),
    entitlementKey: monthlyBoostEntitlementKey(profile, now),
    activeSubscription: allowance > 0
  };
}

export function extendedMonthlyBoostEnd(currentEnd: unknown, now = new Date()) {
  const parsed = Date.parse(String(currentEnd ?? ""));
  const base = Number.isFinite(parsed) && parsed > now.getTime() ? parsed : now.getTime();
  return new Date(base + MONTHLY_BOOST_DURATION_MS).toISOString();
}

const BOOST_RANKING_BLOCKED = new Set(["draft", "pending_review", "changes_requested", "cancelled", "canceled", "completed", "suspended", "hidden", "deleted", "rejected", "archived"]);

export function hasActiveMonthlyBoost(challenge: Record<string, unknown>, now = new Date()) {
  const status = String(challenge.status ?? challenge.lifecycleStatus ?? "").toLowerCase();
  if (BOOST_RANKING_BLOCKED.has(status) || challenge.deleted === true || challenge.publicVisibility === false || challenge.moderationBlocked === true) return false;
  const endsAt = [challenge.monthlyBoostEndsAt, challenge.rewardBoostEndsAt, challenge.boostEndsAt, challenge.boostedUntil]
    .map((value) => Date.parse(String(value ?? "")))
    .filter(Number.isFinite)
    .reduce((latest, value) => Math.max(latest, value), 0);
  return endsAt > now.getTime();
}

export function monthlyBoostRankingWeight(challenge: Record<string, unknown>, now = new Date()) {
  return hasActiveMonthlyBoost(challenge, now) ? 12 : 0;
}
