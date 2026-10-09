import { isChallengeEligibleForBoost, isPublicChallengeStatus } from "@/lib/challenge-status";
import { hasActiveMonthlyBoost, monthlyBoostEntitlement, monthlyBoostEntitlementKey, monthlyBoostMonthKey, monthlyBoostResetAt } from "@/lib/monthly-boost";
import { getUserPlanAccess } from "@/lib/plan-access";
import { userOwnsChallenge } from "@/lib/server/challenge-access";
import { ENTERPRISE_WORKSPACE_LIMITS, enterpriseChallengeInScope, hasEnterprisePermission, normalizeEnterpriseAccess } from "@/lib/enterprise-access";
import { enterpriseProfile } from "@/lib/server/enterprise-access";
import { deterministicId } from "@/lib/server/idempotency";
const NON_PUBLIC_VISIBILITY = new Set(["private", "hidden", "unlisted", "draft", "incomplete", "pending", "rejected", "suspended", "archived", "deleted", "cancelled"]);

export function getChallengeBoostAccess(input: {
  challenge: Record<string, unknown>;
  userId: string | null | undefined;
  profile?: Record<string, unknown> | null;
  enterpriseAccess?: import("@/lib/enterprise-access").EnterpriseAccessRecord | null;
}) {
  const { challenge, userId } = input;
  const status = String(challenge.status ?? challenge.lifecycleStatus ?? "").toLowerCase();
  const visibility = String(challenge.visibility ?? challenge.accessType ?? challenge.publicVisibility ?? "public").toLowerCase();
  const planAccess = getUserPlanAccess(input.profile ?? {});
  const official = challenge.officialChallenge === true || challenge.ownershipType === "challenge_suite_official" || Boolean(challenge.organizationOwnerId);
  const enterpriseOwner = Boolean(input.enterpriseAccess && userId && hasEnterprisePermission(input.enterpriseAccess, "boost.redeem") && enterpriseChallengeInScope(input.enterpriseAccess, challenge, userId, true));
  const owner = official ? enterpriseOwner : Boolean(userId && userOwnsChallenge(challenge, userId));
  const allowedAccount = ["creator", "pro", "host", "enterprise"].includes(planAccess.normalizedPlanId) && planAccess.accountType !== "sponsor";
  const publiclyVisible = isPublicChallengeStatus(status) && !NON_PUBLIC_VISIBILITY.has(visibility);
  const eligibleStatus = isChallengeEligibleForBoost(status);

  if (!userId) return { allowed: false, owner: false, publiclyVisible, eligibleStatus, reason: "auth_required" as const };
  if (!owner) return { allowed: false, owner: false, publiclyVisible, eligibleStatus, reason: "owner_required" as const };
  if (!enterpriseOwner && (!allowedAccount || planAccess.monthlyBoostLimit <= 0)) return { allowed: false, owner: true, publiclyVisible, eligibleStatus, reason: "plan_required" as const };
  if (!publiclyVisible) return { allowed: false, owner: true, publiclyVisible: false, eligibleStatus, reason: "public_challenge_required" as const };
  if (!eligibleStatus) return { allowed: false, owner: true, publiclyVisible, eligibleStatus: false, reason: "status_not_eligible" as const };
  return { allowed: true, owner: true, publiclyVisible: true, eligibleStatus: true, reason: null };
}

export async function loadMonthlyBoostState(db: FirebaseFirestore.Firestore, challenge: Record<string, unknown>, userId: string, profile: Record<string, unknown>, now = new Date(), enterpriseAccess: import("@/lib/enterprise-access").EnterpriseAccessRecord | null = null) {
  const enterpriseOwner = Boolean(enterpriseAccess && challenge.organizationOwnerId && enterpriseAccess.organizationId === challenge.organizationOwnerId && hasEnterprisePermission(enterpriseAccess, "boost.redeem"));
  const entitlementKey = enterpriseOwner ? `enterprise:${enterpriseAccess!.organizationId}:${monthlyBoostMonthKey(now)}` : monthlyBoostEntitlementKey(profile, now);
  const entitlementId = enterpriseOwner
    ? deterministicId("monthly_boost_entitlement", "enterprise", enterpriseAccess!.organizationId, monthlyBoostMonthKey(now))
    : deterministicId("monthly_boost_entitlement", userId, entitlementKey);
  const entitlementSnap = await db.collection("monthlyBoostEntitlements").doc(entitlementId).get();
  const used = Number(entitlementSnap.data()?.used ?? 0);
  const entitlement = enterpriseOwner
    ? { planId: "enterprise", allowance: ENTERPRISE_WORKSPACE_LIMITS.monthlyBoostLimit, used, remaining: Math.max(0, ENTERPRISE_WORKSPACE_LIMITS.monthlyBoostLimit - used), resetAt: monthlyBoostResetAt(now) }
    : monthlyBoostEntitlement(profile, used, now);
  return {
    ...entitlement,
    access: getChallengeBoostAccess({ challenge, userId, profile }),
    active: hasActiveMonthlyBoost(challenge, now),
    endsAt: challenge.monthlyBoostEndsAt ?? challenge.boostEndsAt ?? challenge.boostedUntil ?? null,
    durationHours: 72
  };
}

export async function loadEnterpriseBoostAccess(db: FirebaseFirestore.Firestore, userId: string, challenge: Record<string, unknown>, profile?: Record<string, unknown>) {
  const official = challenge.officialChallenge === true || challenge.ownershipType === "challenge_suite_official" || Boolean(challenge.organizationOwnerId);
  if (!official) return null;
  return profile ? normalizeEnterpriseAccess(profile) : (await enterpriseProfile(db, userId)).access;
}
