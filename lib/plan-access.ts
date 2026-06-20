export type ProductPlanId = "free" | "premium" | "creator_pro" | "verified_host";
export type PlanStatus = "active" | "inactive" | "trial" | "expired";

export interface PlanAccess {
  planId: ProductPlanId;
  planName: string;
  isPremium: boolean;
  isCreatorPro: boolean;
  isVerifiedHost: boolean;
  planStatus: PlanStatus;
  activeChallengeLimit: number;
  dailyFreeVoteLimit: number;
  canCreatePaidChallenges: boolean;
  canCreatePrivateChallenges: boolean;
  canCreatePrizeChallenges: boolean;
  canCreateSponsoredChallenges: boolean;
  canHostLiveEvents: boolean;
  canAccessPremiumChallenges: boolean;
  canUseAdvancedAnalytics: boolean;
}

const accessByPlan: Record<ProductPlanId, Omit<PlanAccess, "planStatus">> = {
  free: {
    planId: "free",
    planName: "Free Member",
    isPremium: false,
    isCreatorPro: false,
    isVerifiedHost: false,
    activeChallengeLimit: 1,
    dailyFreeVoteLimit: 5,
    canCreatePaidChallenges: false,
    canCreatePrivateChallenges: false,
    canCreatePrizeChallenges: false,
    canCreateSponsoredChallenges: false,
    canHostLiveEvents: false,
    canAccessPremiumChallenges: false,
    canUseAdvancedAnalytics: false
  },
  premium: {
    planId: "premium",
    planName: "Premium Member",
    isPremium: true,
    isCreatorPro: false,
    isVerifiedHost: false,
    activeChallengeLimit: 5,
    dailyFreeVoteLimit: 20,
    canCreatePaidChallenges: false,
    canCreatePrivateChallenges: false,
    canCreatePrizeChallenges: false,
    canCreateSponsoredChallenges: false,
    canHostLiveEvents: false,
    canAccessPremiumChallenges: true,
    canUseAdvancedAnalytics: false
  },
  creator_pro: {
    planId: "creator_pro",
    planName: "Creator Pro",
    isPremium: true,
    isCreatorPro: true,
    isVerifiedHost: false,
    activeChallengeLimit: 25,
    dailyFreeVoteLimit: 50,
    canCreatePaidChallenges: true,
    canCreatePrivateChallenges: true,
    canCreatePrizeChallenges: true,
    canCreateSponsoredChallenges: true,
    canHostLiveEvents: false,
    canAccessPremiumChallenges: true,
    canUseAdvancedAnalytics: true
  },
  verified_host: {
    planId: "verified_host",
    planName: "Verified Host",
    isPremium: true,
    isCreatorPro: true,
    isVerifiedHost: true,
    activeChallengeLimit: 50,
    dailyFreeVoteLimit: 50,
    canCreatePaidChallenges: true,
    canCreatePrivateChallenges: true,
    canCreatePrizeChallenges: true,
    canCreateSponsoredChallenges: true,
    canHostLiveEvents: true,
    canAccessPremiumChallenges: true,
    canUseAdvancedAnalytics: true
  }
};

export function normalizePlanId(planId: unknown): ProductPlanId {
  if (planId === "premium" || planId === "creator_pro" || planId === "verified_host" || planId === "free") return planId;
  if (planId === "creator" || planId === "competitor") return "premium";
  if (planId === "executive_host" || planId === "chief_producer") return "verified_host";
  return "free";
}

export function getUserPlanAccess(profile: Record<string, unknown> = {}): PlanAccess {
  const normalizedPlanId = normalizePlanId(profile.planId);
  const status = typeof profile.planStatus === "string" ? profile.planStatus as PlanStatus : "active";
  const active = status === "active" || status === "trial";
  const base = active ? accessByPlan[normalizedPlanId] : accessByPlan.free;
  return {
    ...base,
    planStatus: status,
    activeChallengeLimit: Number(profile.activeChallengeLimit ?? base.activeChallengeLimit),
    dailyFreeVoteLimit: Number(profile.dailyFreeVoteLimit ?? base.dailyFreeVoteLimit)
  };
}

export function planFieldsFor(planId: ProductPlanId) {
  const access = getUserPlanAccess({ planId });
  return {
    planId: access.planId,
    planName: access.planName,
    isPremium: access.isPremium,
    isCreatorPro: access.isCreatorPro,
    isVerifiedHost: access.isVerifiedHost,
    planStatus: access.planStatus,
    activeChallengeLimit: access.activeChallengeLimit,
    dailyFreeVoteLimit: access.dailyFreeVoteLimit,
    canCreatePaidChallenges: access.canCreatePaidChallenges,
    canCreatePrivateChallenges: access.canCreatePrivateChallenges,
    canCreatePrizeChallenges: access.canCreatePrizeChallenges,
    canCreateSponsoredChallenges: access.canCreateSponsoredChallenges,
    canHostLiveEvents: access.canHostLiveEvents,
    canAccessPremiumChallenges: access.canAccessPremiumChallenges,
    canUseAdvancedAnalytics: access.canUseAdvancedAnalytics
  };
}

export function getDailyVoteLimit(profile: Record<string, unknown> = {}) {
  return getUserPlanAccess(profile).dailyFreeVoteLimit;
}

export function canHostLiveEvent(profile: Record<string, unknown> = {}) {
  return getUserPlanAccess(profile).canHostLiveEvents;
}

export function canAccessChallenge(profile: Record<string, unknown>, challenge: Record<string, unknown>) {
  const access = getUserPlanAccess(profile);
  const visibility = String(challenge.visibility ?? challenge.type ?? "public").toLowerCase();
  const premiumOnly = Boolean(challenge.premiumOnly || visibility.includes("premium"));
  const privateOnly = visibility.includes("private") || visibility.includes("exclusive");
  return {
    allowed: (!premiumOnly || access.canAccessPremiumChallenges) && (!privateOnly || access.canCreatePrivateChallenges),
    code: premiumOnly && !access.canAccessPremiumChallenges ? "PREMIUM_REQUIRED" : privateOnly && !access.canCreatePrivateChallenges ? "CREATOR_PRO_REQUIRED" : null
  };
}

export function canCreateChallenge(profile: Record<string, unknown>, challengeInput: Record<string, unknown>, activeChallengeCount: number) {
  const access = getUserPlanAccess(profile);
  const publishing = Boolean(challengeInput.publish) || String(challengeInput.status ?? "").toLowerCase() === "published";
  if (!publishing) return { allowed: true, code: null, message: "Drafts are allowed." };

  if (activeChallengeCount >= access.activeChallengeLimit) {
    return { allowed: false, code: "PLAN_LIMIT_REACHED", message: `Your ${access.planName} plan allows ${access.activeChallengeLimit} active challenge${access.activeChallengeLimit === 1 ? "" : "s"}.` };
  }

  const type = String(challengeInput.type ?? challengeInput.visibility ?? "public").toLowerCase();
  const prizeType = String(challengeInput.prizeType ?? "").toLowerCase();
  const entryFee = Number(challengeInput.entryFee ?? 0);
  const prizePool = Number(challengeInput.prizePool ?? 0);
  const sponsored = Boolean(challengeInput.sponsored || challengeInput.sponsorshipEnabled || challengeInput.enableSponsorship);
  const privateChallenge = type.includes("private") || type.includes("exclusive");
  const premiumOnly = type.includes("premium") || Boolean(challengeInput.premiumOnly);
  const paid = entryFee > 0;
  const prize = prizePool > 0 || (prizeType && !prizeType.includes("bragging"));

  if (paid && !access.canCreatePaidChallenges) return { allowed: false, code: "CREATOR_PRO_REQUIRED", message: "Creator Pro is required to publish paid entry challenges." };
  if (privateChallenge && !access.canCreatePrivateChallenges) return { allowed: false, code: "CREATOR_PRO_REQUIRED", message: "Creator Pro is required to publish private or exclusive challenges." };
  if (premiumOnly && !access.canAccessPremiumChallenges) return { allowed: false, code: "PREMIUM_REQUIRED", message: "Premium access is required to publish premium-only challenges." };
  if (prize && !access.canCreatePrizeChallenges) return { allowed: false, code: "CREATOR_PRO_REQUIRED", message: "Creator Pro is required to publish prize-money or product-prize challenges." };
  if (sponsored && !access.canCreateSponsoredChallenges) return { allowed: false, code: "CREATOR_PRO_REQUIRED", message: "Creator Pro is required to publish sponsored challenges." };

  return { allowed: true, code: null, message: "Challenge can be created." };
}
