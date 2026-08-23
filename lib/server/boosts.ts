import { isChallengeEligibleForBoost, isPublicChallengeStatus } from "@/lib/challenge-status";
import { hasActiveMonthlyBoost, monthlyBoostEntitlement, monthlyBoostEntitlementKey } from "@/lib/monthly-boost";
import { getUserPlanAccess } from "@/lib/plan-access";
import { userOwnsChallenge } from "@/lib/server/challenge-access";
import { deterministicId } from "@/lib/server/idempotency";
const NON_PUBLIC_VISIBILITY = new Set(["private", "hidden", "unlisted", "draft", "incomplete", "pending", "rejected", "suspended", "archived", "deleted", "cancelled"]);

export function getChallengeBoostAccess(input: {
  challenge: Record<string, unknown>;
  userId: string | null | undefined;
  profile?: Record<string, unknown> | null;
}) {
  const { challenge, userId } = input;
  const status = String(challenge.status ?? challenge.lifecycleStatus ?? "").toLowerCase();
  const visibility = String(challenge.visibility ?? challenge.accessType ?? challenge.publicVisibility ?? "public").toLowerCase();
  const planAccess = getUserPlanAccess(input.profile ?? {});
  const owner = Boolean(userId && userOwnsChallenge(challenge, userId));
  const allowedAccount = ["creator", "pro", "host", "enterprise"].includes(planAccess.normalizedPlanId) && planAccess.accountType !== "sponsor";
  const publiclyVisible = isPublicChallengeStatus(status) && !NON_PUBLIC_VISIBILITY.has(visibility);
  const eligibleStatus = isChallengeEligibleForBoost(status);

  if (!userId) return { allowed: false, owner: false, publiclyVisible, eligibleStatus, reason: "auth_required" as const };
  if (!owner) return { allowed: false, owner: false, publiclyVisible, eligibleStatus, reason: "owner_required" as const };
  if (!allowedAccount || planAccess.monthlyBoostLimit <= 0) return { allowed: false, owner: true, publiclyVisible, eligibleStatus, reason: "plan_required" as const };
  if (!publiclyVisible) return { allowed: false, owner: true, publiclyVisible: false, eligibleStatus, reason: "public_challenge_required" as const };
  if (!eligibleStatus) return { allowed: false, owner: true, publiclyVisible, eligibleStatus: false, reason: "status_not_eligible" as const };
  return { allowed: true, owner: true, publiclyVisible: true, eligibleStatus: true, reason: null };
}

export async function loadMonthlyBoostState(db: FirebaseFirestore.Firestore, challenge: Record<string, unknown>, userId: string, profile: Record<string, unknown>, now = new Date()) {
  const entitlementId = deterministicId("monthly_boost_entitlement", userId, monthlyBoostEntitlementKey(profile, now));
  const entitlementSnap = await db.collection("monthlyBoostEntitlements").doc(entitlementId).get();
  const entitlement = monthlyBoostEntitlement(profile, Number(entitlementSnap.data()?.used ?? 0), now);
  return {
    ...entitlement,
    access: getChallengeBoostAccess({ challenge, userId, profile }),
    active: hasActiveMonthlyBoost(challenge, now),
    endsAt: challenge.monthlyBoostEndsAt ?? challenge.boostEndsAt ?? challenge.boostedUntil ?? null,
    durationHours: 72
  };
}
