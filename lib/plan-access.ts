import type { AccountType, ProductPlanId as BlueprintPlanId, SponsorProductPlanId, UserProductPlanId } from "@/lib/types";

export type ProductPlanId = "free" | "premium" | "creator_pro" | "verified_host";
export type PlanStatus = "active" | "inactive" | "trial" | "trialing" | "expired" | "cancelled" | "canceled" | "past_due" | "incomplete" | "paused";

export interface PlanAccess {
  planId: ProductPlanId;
  normalizedPlanId: BlueprintPlanId;
  planName: string;
  accountType: Exclude<AccountType, "admin">;
  isPremium: boolean;
  isCreator: boolean;
  isPro: boolean;
  isHost: boolean;
  isEnterprise: boolean;
  isSponsor: boolean;
  isSponsorStarter: boolean;
  isBrandPartner: boolean;
  isEnterprisePartner: boolean;
  isCreatorPro: boolean;
  isVerifiedHost: boolean;
  planStatus: PlanStatus;
  activeChallengeLimit: number;
  privateChallengeLimit: number;
  dailyFreeVoteLimit: number;
  monthlyBoostLimit: number;
  voteMultiplierLimit: number;
  canCreatePaidChallenges: boolean;
  canCreatePrivateChallenges: boolean;
  canCreatePrizeChallenges: boolean;
  canCreateSponsoredChallenges: boolean;
  canReceiveSponsorRequests: boolean;
  canSendSponsorProposals: boolean;
  canHostLiveEvents: boolean;
  liveEventCapacity: number;
  canManageTournaments: boolean;
  canAccessPremiumChallenges: boolean;
  canUseAdvancedAnalytics: boolean;
  canUseSponsorDashboard: boolean;
  canCreateSponsorCampaigns: boolean;
  canSponsorChallenges: boolean;
  sponsorCampaignLimit: number;
}

const userPlanOrder: UserProductPlanId[] = ["free", "creator", "pro", "host", "enterprise"];
const sponsorPlanOrder: SponsorProductPlanId[] = ["sponsor_starter", "brand_partner", "enterprise_partner"];

const legacyPlanAliases: Record<string, BlueprintPlanId> = {
  observer: "free",
  premium: "pro",
  creator_pro: "creator",
  verified_host: "host",
  competitor: "pro",
  executive_host: "host",
  chief_producer: "enterprise",
  enterprise_sponsor: "enterprise_partner"
};

const customizationPlanByBlueprint: Record<BlueprintPlanId, ProductPlanId> = {
  free: "free",
  creator: "creator_pro",
  pro: "premium",
  host: "verified_host",
  enterprise: "verified_host",
  sponsor_starter: "premium",
  brand_partner: "premium",
  enterprise_partner: "verified_host"
};

const accessByPlan: Record<BlueprintPlanId, Omit<PlanAccess, "planStatus">> = {
  free: {
    planId: "free",
    normalizedPlanId: "free",
    planName: "Free",
    accountType: "user",
    isPremium: false,
    isCreator: false,
    isPro: false,
    isHost: false,
    isEnterprise: false,
    isSponsor: false,
    isSponsorStarter: false,
    isBrandPartner: false,
    isEnterprisePartner: false,
    isCreatorPro: false,
    isVerifiedHost: false,
    activeChallengeLimit: 1,
    privateChallengeLimit: 0,
    dailyFreeVoteLimit: 1,
    monthlyBoostLimit: 0,
    voteMultiplierLimit: 0,
    canCreatePaidChallenges: false,
    canCreatePrivateChallenges: false,
    canCreatePrizeChallenges: false,
    canCreateSponsoredChallenges: false,
    canReceiveSponsorRequests: false,
    canSendSponsorProposals: false,
    canHostLiveEvents: false,
    liveEventCapacity: 0,
    canManageTournaments: false,
    canAccessPremiumChallenges: false,
    canUseAdvancedAnalytics: false,
    canUseSponsorDashboard: false,
    canCreateSponsorCampaigns: false,
    canSponsorChallenges: false,
    sponsorCampaignLimit: 0
  },
  creator: {
    planId: "creator_pro",
    normalizedPlanId: "creator",
    planName: "Creator",
    accountType: "user",
    isPremium: true,
    isCreator: true,
    isPro: false,
    isHost: false,
    isEnterprise: false,
    isSponsor: false,
    isSponsorStarter: false,
    isBrandPartner: false,
    isEnterprisePartner: false,
    isCreatorPro: true,
    isVerifiedHost: false,
    activeChallengeLimit: 3,
    privateChallengeLimit: 1,
    dailyFreeVoteLimit: 5,
    monthlyBoostLimit: 1,
    voteMultiplierLimit: 1,
    canCreatePaidChallenges: false,
    canCreatePrivateChallenges: true,
    canCreatePrizeChallenges: true,
    canCreateSponsoredChallenges: true,
    canReceiveSponsorRequests: true,
    canSendSponsorProposals: false,
    canHostLiveEvents: false,
    liveEventCapacity: 0,
    canManageTournaments: false,
    canAccessPremiumChallenges: true,
    canUseAdvancedAnalytics: true,
    canUseSponsorDashboard: false,
    canCreateSponsorCampaigns: false,
    canSponsorChallenges: false,
    sponsorCampaignLimit: 0
  },
  pro: {
    planId: "premium",
    normalizedPlanId: "pro",
    planName: "Pro",
    accountType: "user",
    isPremium: true,
    isCreator: true,
    isPro: true,
    isHost: false,
    isEnterprise: false,
    isSponsor: false,
    isSponsorStarter: false,
    isBrandPartner: false,
    isEnterprisePartner: false,
    isCreatorPro: true,
    isVerifiedHost: false,
    activeChallengeLimit: 25,
    privateChallengeLimit: 5,
    dailyFreeVoteLimit: 20,
    monthlyBoostLimit: 3,
    voteMultiplierLimit: 3,
    canCreatePaidChallenges: false,
    canCreatePrivateChallenges: true,
    canCreatePrizeChallenges: true,
    canCreateSponsoredChallenges: true,
    canReceiveSponsorRequests: true,
    canSendSponsorProposals: true,
    canHostLiveEvents: false,
    liveEventCapacity: 0,
    canManageTournaments: false,
    canAccessPremiumChallenges: true,
    canUseAdvancedAnalytics: true,
    canUseSponsorDashboard: false,
    canCreateSponsorCampaigns: false,
    canSponsorChallenges: false,
    sponsorCampaignLimit: 0
  },
  host: {
    planId: "verified_host",
    normalizedPlanId: "host",
    planName: "Host",
    accountType: "user",
    isPremium: true,
    isCreator: true,
    isPro: true,
    isHost: true,
    isEnterprise: false,
    isSponsor: false,
    isSponsorStarter: false,
    isBrandPartner: false,
    isEnterprisePartner: false,
    isCreatorPro: true,
    isVerifiedHost: true,
    activeChallengeLimit: 50,
    privateChallengeLimit: 50,
    dailyFreeVoteLimit: 50,
    monthlyBoostLimit: 10,
    voteMultiplierLimit: 5,
    canCreatePaidChallenges: false,
    canCreatePrivateChallenges: true,
    canCreatePrizeChallenges: true,
    canCreateSponsoredChallenges: true,
    canReceiveSponsorRequests: true,
    canSendSponsorProposals: true,
    canHostLiveEvents: true,
    liveEventCapacity: 100,
    canManageTournaments: true,
    canAccessPremiumChallenges: true,
    canUseAdvancedAnalytics: true,
    canUseSponsorDashboard: false,
    canCreateSponsorCampaigns: false,
    canSponsorChallenges: false,
    sponsorCampaignLimit: 0
  },
  enterprise: {
    planId: "verified_host",
    normalizedPlanId: "enterprise",
    planName: "Enterprise",
    accountType: "user",
    isPremium: true,
    isCreator: true,
    isPro: true,
    isHost: true,
    isEnterprise: true,
    isSponsor: false,
    isSponsorStarter: false,
    isBrandPartner: false,
    isEnterprisePartner: false,
    isCreatorPro: true,
    isVerifiedHost: true,
    activeChallengeLimit: 500,
    privateChallengeLimit: 500,
    dailyFreeVoteLimit: 100,
    monthlyBoostLimit: 50,
    voteMultiplierLimit: 20,
    canCreatePaidChallenges: false,
    canCreatePrivateChallenges: true,
    canCreatePrizeChallenges: true,
    canCreateSponsoredChallenges: true,
    canReceiveSponsorRequests: true,
    canSendSponsorProposals: true,
    canHostLiveEvents: true,
    liveEventCapacity: 1000,
    canManageTournaments: true,
    canAccessPremiumChallenges: true,
    canUseAdvancedAnalytics: true,
    canUseSponsorDashboard: false,
    canCreateSponsorCampaigns: false,
    canSponsorChallenges: false,
    sponsorCampaignLimit: 0
  },
  sponsor_starter: {
    planId: "premium",
    normalizedPlanId: "sponsor_starter",
    planName: "Sponsor Starter",
    accountType: "sponsor",
    isPremium: true,
    isCreator: false,
    isPro: false,
    isHost: false,
    isEnterprise: false,
    isSponsor: true,
    isSponsorStarter: true,
    isBrandPartner: false,
    isEnterprisePartner: false,
    isCreatorPro: false,
    isVerifiedHost: false,
    activeChallengeLimit: 0,
    privateChallengeLimit: 0,
    dailyFreeVoteLimit: 0,
    monthlyBoostLimit: 0,
    voteMultiplierLimit: 0,
    canCreatePaidChallenges: false,
    canCreatePrivateChallenges: false,
    canCreatePrizeChallenges: false,
    canCreateSponsoredChallenges: false,
    canReceiveSponsorRequests: false,
    canSendSponsorProposals: false,
    canHostLiveEvents: false,
    liveEventCapacity: 0,
    canManageTournaments: false,
    canAccessPremiumChallenges: false,
    canUseAdvancedAnalytics: true,
    canUseSponsorDashboard: true,
    canCreateSponsorCampaigns: true,
    canSponsorChallenges: true,
    sponsorCampaignLimit: 2
  },
  brand_partner: {
    planId: "premium",
    normalizedPlanId: "brand_partner",
    planName: "Brand Partner",
    accountType: "sponsor",
    isPremium: true,
    isCreator: false,
    isPro: false,
    isHost: false,
    isEnterprise: false,
    isSponsor: true,
    isSponsorStarter: true,
    isBrandPartner: true,
    isEnterprisePartner: false,
    isCreatorPro: false,
    isVerifiedHost: false,
    activeChallengeLimit: 0,
    privateChallengeLimit: 0,
    dailyFreeVoteLimit: 0,
    monthlyBoostLimit: 0,
    voteMultiplierLimit: 0,
    canCreatePaidChallenges: false,
    canCreatePrivateChallenges: false,
    canCreatePrizeChallenges: false,
    canCreateSponsoredChallenges: false,
    canReceiveSponsorRequests: false,
    canSendSponsorProposals: false,
    canHostLiveEvents: false,
    liveEventCapacity: 0,
    canManageTournaments: false,
    canAccessPremiumChallenges: false,
    canUseAdvancedAnalytics: true,
    canUseSponsorDashboard: true,
    canCreateSponsorCampaigns: true,
    canSponsorChallenges: true,
    sponsorCampaignLimit: 10
  },
  enterprise_partner: {
    planId: "verified_host",
    normalizedPlanId: "enterprise_partner",
    planName: "Enterprise Partner",
    accountType: "sponsor",
    isPremium: true,
    isCreator: false,
    isPro: false,
    isHost: false,
    isEnterprise: true,
    isSponsor: true,
    isSponsorStarter: true,
    isBrandPartner: true,
    isEnterprisePartner: true,
    isCreatorPro: false,
    isVerifiedHost: false,
    activeChallengeLimit: 0,
    privateChallengeLimit: 0,
    dailyFreeVoteLimit: 0,
    monthlyBoostLimit: 0,
    voteMultiplierLimit: 0,
    canCreatePaidChallenges: false,
    canCreatePrivateChallenges: false,
    canCreatePrizeChallenges: false,
    canCreateSponsoredChallenges: false,
    canReceiveSponsorRequests: false,
    canSendSponsorProposals: false,
    canHostLiveEvents: false,
    liveEventCapacity: 0,
    canManageTournaments: false,
    canAccessPremiumChallenges: false,
    canUseAdvancedAnalytics: true,
    canUseSponsorDashboard: true,
    canCreateSponsorCampaigns: true,
    canSponsorChallenges: true,
    sponsorCampaignLimit: 100
  }
};

export function normalizePlanId(planId: unknown): BlueprintPlanId {
  if (typeof planId !== "string") return "free";
  if (planId in accessByPlan) return planId as BlueprintPlanId;
  return legacyPlanAliases[planId] ?? "free";
}

export function normalizeCustomizationPlanId(planId: unknown): ProductPlanId {
  return customizationPlanByBlueprint[normalizePlanId(planId)];
}

export function normalizeAccountType(profile: Record<string, unknown> = {}): Exclude<AccountType, "admin"> {
  const explicit = profile.accountType ?? profile.dashboardType;
  if (explicit === "sponsor" || explicit === "brand") return "sponsor";
  if (profile.role === "sponsor") return "sponsor";
  const normalized = normalizePlanId(profile.planId);
  return sponsorPlanOrder.includes(normalized as SponsorProductPlanId) ? "sponsor" : "user";
}

export function getUserPlanAccess(profile: Record<string, unknown> = {}): PlanAccess {
  const normalizedPlanId = normalizePlanId(profile.planId);
  const status = typeof profile.planStatus === "string" ? profile.planStatus as PlanStatus : "active";
  const active = status === "active" || status === "trial" || status === "trialing";
  const base = active ? accessByPlan[normalizedPlanId] : accessByPlan.free;
  return {
    ...base,
    accountType: normalizeAccountType({ ...profile, planId: normalizedPlanId }),
    planStatus: status,
    activeChallengeLimit: Number(profile.activeChallengeLimit ?? base.activeChallengeLimit),
    privateChallengeLimit: Number(profile.privateChallengeLimit ?? base.privateChallengeLimit),
    dailyFreeVoteLimit: Number(profile.dailyFreeVoteLimit ?? base.dailyFreeVoteLimit),
    monthlyBoostLimit: Number(profile.monthlyBoostLimit ?? base.monthlyBoostLimit),
    voteMultiplierLimit: Number(profile.voteMultiplierLimit ?? base.voteMultiplierLimit),
    sponsorCampaignLimit: Number(profile.sponsorCampaignLimit ?? base.sponsorCampaignLimit)
  };
}

export function planFieldsFor(planId: BlueprintPlanId | ProductPlanId | unknown) {
  const access = getUserPlanAccess({ planId });
  return {
    accountType: access.accountType,
    planId: access.normalizedPlanId,
    legacyPlanId: access.planId,
    planName: access.planName,
    isPremium: access.isPremium,
    isCreator: access.isCreator,
    isPro: access.isPro,
    isHost: access.isHost,
    isEnterprise: access.isEnterprise,
    isSponsor: access.isSponsor,
    isSponsorStarter: access.isSponsorStarter,
    isBrandPartner: access.isBrandPartner,
    isEnterprisePartner: access.isEnterprisePartner,
    isCreatorPro: access.isCreatorPro,
    isVerifiedHost: access.isVerifiedHost,
    planStatus: access.planStatus,
    activeChallengeLimit: access.activeChallengeLimit,
    privateChallengeLimit: access.privateChallengeLimit,
    dailyFreeVoteLimit: access.dailyFreeVoteLimit,
    monthlyBoostLimit: access.monthlyBoostLimit,
    voteMultiplierLimit: access.voteMultiplierLimit,
    canCreatePaidChallenges: access.canCreatePaidChallenges,
    canCreatePrivateChallenges: access.canCreatePrivateChallenges,
    canCreatePrizeChallenges: access.canCreatePrizeChallenges,
    canCreateSponsoredChallenges: access.canCreateSponsoredChallenges,
    canReceiveSponsorRequests: access.canReceiveSponsorRequests,
    canSendSponsorProposals: access.canSendSponsorProposals,
    canHostLiveEvents: access.canHostLiveEvents,
    liveEventCapacity: access.liveEventCapacity,
    canManageTournaments: access.canManageTournaments,
    canAccessPremiumChallenges: access.canAccessPremiumChallenges,
    canUseAdvancedAnalytics: access.canUseAdvancedAnalytics,
    canUseSponsorDashboard: access.canUseSponsorDashboard,
    canCreateSponsorCampaigns: access.canCreateSponsorCampaigns,
    canSponsorChallenges: access.canSponsorChallenges,
    sponsorCampaignLimit: access.sponsorCampaignLimit
  };
}

export function getPlanRank(planId: unknown) {
  const normalized = normalizePlanId(planId);
  const userRank = userPlanOrder.indexOf(normalized as UserProductPlanId);
  if (userRank >= 0) return userRank;
  const sponsorRank = sponsorPlanOrder.indexOf(normalized as SponsorProductPlanId);
  return sponsorRank >= 0 ? sponsorRank : 0;
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
    code: premiumOnly && !access.canAccessPremiumChallenges ? "PREMIUM_REQUIRED" : privateOnly && !access.canCreatePrivateChallenges ? "CREATOR_REQUIRED" : null
  };
}

export function canCreateChallenge(profile: Record<string, unknown>, challengeInput: Record<string, unknown>, activeChallengeCount: number) {
  const access = getUserPlanAccess(profile);
  const publishing = Boolean(challengeInput.publish) || !["", "draft"].includes(String(challengeInput.status ?? "").toLowerCase());
  if (!publishing) return { allowed: true, code: null, message: "Drafts are allowed." };
  if (access.isSponsor) return { allowed: false, code: "USER_ACCOUNT_REQUIRED", message: "Sponsors manage campaigns from the Brand Command Center. Challenge creation is for user, creator, pro, host, and enterprise accounts." };

  if (activeChallengeCount >= access.activeChallengeLimit) {
    return { allowed: false, code: "PLAN_LIMIT_REACHED", message: `Your ${access.planName} plan allows ${access.activeChallengeLimit} active challenge${access.activeChallengeLimit === 1 ? "" : "s"}.` };
  }

  const type = String(challengeInput.type ?? challengeInput.visibility ?? "public").toLowerCase();
  const format = String(challengeInput.competitionFormat ?? "").toLowerCase();
  const prizeType = String(challengeInput.prizeType ?? "").toLowerCase();
  const entryFee = Number(challengeInput.entryFee ?? 0);
  const prizePool = Number(challengeInput.prizePool ?? 0);
  const sponsored = Boolean(challengeInput.sponsorEnabled || challengeInput.sponsored || challengeInput.sponsorshipEnabled || challengeInput.enableSponsorship);
  const privateChallenge = type.includes("private") || type.includes("exclusive");
  const premiumOnly = type.includes("premium") || Boolean(challengeInput.premiumOnly);
  const paid = entryFee > 0 || Boolean(challengeInput.paidEntryEnabled);
  const tournament = type.includes("tournament") || format.includes("tournament") || format.includes("bracket");
  const prize = prizePool > 0 || Boolean(challengeInput.prizePoolEnabled || challengeInput.cashPayoutsEnabled) || (prizeType && !prizeType.includes("bragging"));

  if (tournament) return { allowed: false, code: "TOURNAMENTS_LOCKED", message: "Tournament creation is locked until Phase 6." };
  if (paid) return { allowed: false, code: "PAID_ENTRY_DISABLED", message: "Paid-entry prize pools are disabled for now. Use sponsor-funded or bragging-rights challenges." };
  if (privateChallenge && !access.canCreatePrivateChallenges) return { allowed: false, code: "CREATOR_REQUIRED", message: "Creator plan or higher is required to publish private or exclusive challenges." };
  if (premiumOnly && !access.canAccessPremiumChallenges) return { allowed: false, code: "PRO_REQUIRED", message: "Pro access is required to publish premium-only challenges." };
  if (prize && !access.canCreatePrizeChallenges) return { allowed: false, code: "CREATOR_REQUIRED", message: "Creator plan or higher is required to publish sponsor-funded prize or product-prize challenges." };
  if (sponsored && !access.canCreateSponsoredChallenges) return { allowed: false, code: "CREATOR_REQUIRED", message: "Creator plan or higher is required to publish sponsor-ready challenges." };

  return { allowed: true, code: null, message: "Challenge can be created." };
}

export function getVoteWeight(profile: Record<string, unknown> = {}, weightedVotes = true) {
  if (!weightedVotes) return 1;
  const access = getUserPlanAccess(profile);
  const multiplier = Number(access.voteMultiplierLimit ?? 0);
  if (multiplier <= 0) return 1;
  return Math.max(1, Math.min(multiplier, 20));
}
