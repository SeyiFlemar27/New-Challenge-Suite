import { isChallengeEligibleForBoost, isPublicChallengeStatus } from "@/lib/challenge-status";
import { getUserPlanAccess } from "@/lib/plan-access";
import { userOwnsChallenge } from "@/lib/server/challenge-access";

export const boostPackages = {
  spark: { id: "spark", name: "Spark Boost", coins: 40, reach: "1,200 estimated views", durationDays: 2 },
  surge: { id: "surge", name: "Surge Boost", coins: 90, reach: "4,800 estimated views", durationDays: 5 },
  spotlight: { id: "spotlight", name: "Spotlight Boost", coins: 180, reach: "12,000 estimated views", durationDays: 7 }
} as const;

export function getBoostPackage(packageId: unknown) {
  if (typeof packageId !== "string") return null;
  return boostPackages[packageId as keyof typeof boostPackages] ?? null;
}
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
  const allowedAccount = ["creator", "host", "enterprise"].includes(String(planAccess.accountType ?? "").toLowerCase());
  const publiclyVisible = isPublicChallengeStatus(status) && !NON_PUBLIC_VISIBILITY.has(visibility);
  const eligibleStatus = isChallengeEligibleForBoost(status);

  if (!userId) return { allowed: false, owner: false, publiclyVisible, eligibleStatus, reason: "auth_required" as const };
  if (!owner) return { allowed: false, owner: false, publiclyVisible, eligibleStatus, reason: "owner_required" as const };
  if (!allowedAccount || planAccess.monthlyBoostLimit <= 0) return { allowed: false, owner: true, publiclyVisible, eligibleStatus, reason: "plan_required" as const };
  if (!publiclyVisible) return { allowed: false, owner: true, publiclyVisible: false, eligibleStatus, reason: "public_challenge_required" as const };
  if (!eligibleStatus) return { allowed: false, owner: true, publiclyVisible, eligibleStatus: false, reason: "status_not_eligible" as const };
  return { allowed: true, owner: true, publiclyVisible: true, eligibleStatus: true, reason: null };
}