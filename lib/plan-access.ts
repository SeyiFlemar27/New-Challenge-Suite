import type { AccountType, ProductPlanId as BlueprintPlanId, SponsorProductPlanId, UserProductPlanId } from "@/lib/types";

export type ProductPlanId = "free" | "premium" | "creator_pro" | "verified_host";
export type PlanStatus = "active" | "inactive" | "trial" | "trialing" | "payment_warning_1" | "payment_warning_2" | "expired" | "cancelled" | "canceled" | "past_due" | "incomplete" | "paused";

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

export interface ChallengeQuota {
  limit: number | null;
  period: "lifetime" | "month";
}

export interface PersonalCapabilities {
  canCreateNormalChallenge: boolean;
  normalChallengeQuota: ChallengeQuota;
  canCreatePrivateChallenge: boolean;
  privateChallengeQuota: ChallengeQuota;
  canCreateTournament: boolean;
  tournamentQuota: ChallengeQuota;
  canCreateLiveEvent: boolean;
  liveEventQuota: ChallengeQuota;
  monthlyBoostQuota: number;
  canUseCreatorAnalytics: boolean;
  canReceiveNewSponsorProposals: boolean;
  canManageExistingSponsorObligations: boolean;
  canManageParticipants: boolean;
  canManageVoting: boolean;
  canManageHostOperations: boolean;
  canManageExistingPremiumChallenges: boolean;
  canUseTeam: boolean;
  canWithdraw: boolean;
}

export type PlanFeature =
  | "private_challenges"
  | "sponsor_challenges"
  | "creator_analytics"
  | "performance_analytics"
  | "boosts"
  | "vote_multipliers"
  | "ranked_challenges"
  | "join_tournaments"
  | "host_control_center"
  | "tournament_builder"
  | "live_event_tools"
  | "participant_management"
  | "submission_moderation"
  | "voting_control"
  | "revenue_overview"
  | "team_management"
  | "data_export"
  | "programs"
  | "custom_branding"
  | "reports"
  | "integrations"
  | "sponsor_command_center";

export interface PlanExperience {
  planId: BlueprintPlanId;
  dashboardName: string;
  dashboardSubtitle: string;
  badgeLabel: string;
  challengeLimitLabel: string;
  privateChallengeLimitLabel: string;
  monthlyChallengeLimit: number | null;
  monthlyPrivateChallengeLimit: number | null;
  teamMemberLimit: number;
  monthlyBoostLimit: number;
  voteMultiplierLimit: number;
  features: Record<PlanFeature, boolean>;
}

export type EffectiveTierId =
  | "free_competitor"
  | "creator_starter"
  | "creator"
  | "host_starter"
  | "pro"
  | "host"
  | "enterprise"
  | "sponsor";

export interface EffectiveTier {
  id: EffectiveTierId;
  planId: BlueprintPlanId;
  accountIntent: string;
  paid: boolean;
  displayName: string;
  badgeLabel: string;
  memberLabel: string;
  dashboardName: string;
  dashboardSubtitle: string;
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

const noFeatures: Record<PlanFeature, boolean> = {
  private_challenges: false,
  sponsor_challenges: false,
  creator_analytics: false,
  performance_analytics: false,
  boosts: false,
  vote_multipliers: false,
  ranked_challenges: false,
  join_tournaments: false,
  host_control_center: false,
  tournament_builder: false,
  live_event_tools: false,
  participant_management: false,
  submission_moderation: false,
  voting_control: false,
  revenue_overview: false,
  team_management: false,
  data_export: false,
  programs: false,
  custom_branding: false,
  reports: false,
  integrations: false,
  sponsor_command_center: false
};

const planExperiences: Record<BlueprintPlanId, PlanExperience> = {
  free: {
    planId: "free",
    dashboardName: "User Dashboard",
    dashboardSubtitle: "Explore challenges, compete, vote, and build your first public challenge.",
    badgeLabel: "Free Competitor",
    challengeLimitLabel: "3 lifetime basic public challenges",
    privateChallengeLimitLabel: "Private challenges locked",
    monthlyChallengeLimit: 3,
    monthlyPrivateChallengeLimit: 0,
    teamMemberLimit: 0,
    monthlyBoostLimit: 0,
    voteMultiplierLimit: 0,
    features: { ...noFeatures }
  },
  creator: {
    planId: "creator",
    dashboardName: "Creator Studio",
    dashboardSubtitle: "Create sponsor-ready challenges, manage your entries, and understand creator performance.",
    badgeLabel: "Creator",
    challengeLimitLabel: "3 challenges / month",
    privateChallengeLimitLabel: "1 private challenge / month",
    monthlyChallengeLimit: 3,
    monthlyPrivateChallengeLimit: 1,
    teamMemberLimit: 0,
    monthlyBoostLimit: 2,
    voteMultiplierLimit: 0,
    features: {
      ...noFeatures,
      private_challenges: true,
      sponsor_challenges: true,
      creator_analytics: true,
      boosts: true,
      revenue_overview: true
    }
  },
  pro: {
    planId: "pro",
    dashboardName: "Creator Studio",
    dashboardSubtitle: "Create challenges, review performance, and manage sponsor-ready work.",
    badgeLabel: "Creator",
    challengeLimitLabel: "3 challenges / month",
    privateChallengeLimitLabel: "1 private challenge / month",
    monthlyChallengeLimit: 3,
    monthlyPrivateChallengeLimit: 1,
    teamMemberLimit: 0,
    monthlyBoostLimit: 2,
    voteMultiplierLimit: 0,
    features: {
      ...noFeatures,
      private_challenges: true,
      sponsor_challenges: true,
      creator_analytics: true,
      performance_analytics: true,
      boosts: true,
      vote_multipliers: false,
      ranked_challenges: false,
      join_tournaments: true,
      revenue_overview: true
    }
  },
  host: {
    planId: "host",
    dashboardName: "Host Control Center",
    dashboardSubtitle: "Operate competitions, participants, submissions, voting, events, sponsors, and review-safe revenue reporting.",
    badgeLabel: "Host",
    challengeLimitLabel: "Unlimited challenges",
    privateChallengeLimitLabel: "Unlimited private challenges",
    monthlyChallengeLimit: null,
    monthlyPrivateChallengeLimit: null,
    teamMemberLimit: 3,
    monthlyBoostLimit: 5,
    voteMultiplierLimit: 0,
    features: {
      ...noFeatures,
      private_challenges: true,
      sponsor_challenges: true,
      creator_analytics: true,
      performance_analytics: true,
      boosts: true,
      vote_multipliers: false,
      ranked_challenges: true,
      join_tournaments: true,
      host_control_center: true,
      tournament_builder: true,
      live_event_tools: true,
      participant_management: true,
      submission_moderation: true,
      voting_control: true,
      revenue_overview: true,
      team_management: true,
      data_export: true,
      reports: true
    }
  },
  enterprise: {
    planId: "enterprise",
    dashboardName: "Enterprise Command Center",
    dashboardSubtitle: "Coordinate programs, campaigns, branded experiences, large competitions, teams, reports, and integrations.",
    badgeLabel: "Enterprise",
    challengeLimitLabel: "Up to 1,000 active official challenges",
    privateChallengeLimitLabel: "Up to 1,000 active private official challenges",
    monthlyChallengeLimit: null,
    monthlyPrivateChallengeLimit: null,
    teamMemberLimit: 999,
    monthlyBoostLimit: 5,
    voteMultiplierLimit: 0,
    features: {
      ...noFeatures,
      private_challenges: true,
      sponsor_challenges: true,
      creator_analytics: true,
      performance_analytics: true,
      boosts: true,
      vote_multipliers: false,
      ranked_challenges: true,
      join_tournaments: true,
      host_control_center: true,
      tournament_builder: true,
      live_event_tools: true,
      participant_management: true,
      submission_moderation: true,
      voting_control: true,
      revenue_overview: true,
      team_management: true,
      data_export: true,
      programs: true,
      custom_branding: true,
      reports: true,
      integrations: true
    }
  },
  sponsor_starter: {
    planId: "sponsor_starter",
    dashboardName: "Brand Command Center",
    dashboardSubtitle: "Discover sponsor-ready challenges and prepare focused brand campaigns.",
    badgeLabel: "Sponsor Starter",
    challengeLimitLabel: "5 active sponsored challenges/month",
    privateChallengeLimitLabel: "Normal challenge creation unavailable",
    monthlyChallengeLimit: 0,
    monthlyPrivateChallengeLimit: 0,
    teamMemberLimit: 1,
    monthlyBoostLimit: 0,
    voteMultiplierLimit: 0,
    features: { ...noFeatures, sponsor_command_center: true, reports: true }
  },
  brand_partner: {
    planId: "brand_partner",
    dashboardName: "Brand Command Center",
    dashboardSubtitle: "Manage brand campaigns, placements, audience insights, reports, and sponsor-ready opportunities.",
    badgeLabel: "Brand Partner",
    challengeLimitLabel: "20 active sponsored challenges/month",
    privateChallengeLimitLabel: "Normal challenge creation unavailable",
    monthlyChallengeLimit: 0,
    monthlyPrivateChallengeLimit: 0,
    teamMemberLimit: 5,
    monthlyBoostLimit: 0,
    voteMultiplierLimit: 0,
    features: { ...noFeatures, sponsor_command_center: true, reports: true, team_management: true, data_export: true }
  },
  enterprise_partner: {
    planId: "enterprise_partner",
    dashboardName: "Brand Command Center",
    dashboardSubtitle: "Coordinate enterprise campaigns, placements, teams, reporting, exports, and integration foundations.",
    badgeLabel: "Enterprise Partner",
    challengeLimitLabel: "Unlimited campaign workspaces",
    privateChallengeLimitLabel: "Normal challenge creation unavailable",
    monthlyChallengeLimit: 0,
    monthlyPrivateChallengeLimit: 0,
    teamMemberLimit: 999,
    monthlyBoostLimit: 0,
    voteMultiplierLimit: 0,
    features: {
      ...noFeatures,
      sponsor_command_center: true,
      reports: true,
      team_management: true,
      data_export: true,
      custom_branding: true,
      integrations: true
    }
  }
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
    activeChallengeLimit: 3,
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
    dailyFreeVoteLimit: 1,
    monthlyBoostLimit: 2,
    voteMultiplierLimit: 0,
    canCreatePaidChallenges: true,
    canCreatePrivateChallenges: true,
    canCreatePrizeChallenges: true,
    canCreateSponsoredChallenges: true,
    canReceiveSponsorRequests: true,
    canSendSponsorProposals: false,
    canHostLiveEvents: false,
    liveEventCapacity: 0,
    canManageTournaments: true,
    canAccessPremiumChallenges: false,
    canUseAdvancedAnalytics: true,
    canUseSponsorDashboard: false,
    canCreateSponsorCampaigns: false,
    canSponsorChallenges: false,
    sponsorCampaignLimit: 0
  },
  pro: {
    planId: "premium",
    normalizedPlanId: "pro",
    planName: "Creator",
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
    activeChallengeLimit: 1000,
    privateChallengeLimit: 5,
    dailyFreeVoteLimit: 1,
    monthlyBoostLimit: 2,
    voteMultiplierLimit: 0,
    canCreatePaidChallenges: true,
    canCreatePrivateChallenges: true,
    canCreatePrizeChallenges: true,
    canCreateSponsoredChallenges: true,
    canReceiveSponsorRequests: true,
    canSendSponsorProposals: true,
    canHostLiveEvents: false,
    liveEventCapacity: 0,
    canManageTournaments: true,
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
    activeChallengeLimit: 1000,
    privateChallengeLimit: 1000,
    dailyFreeVoteLimit: 1,
    monthlyBoostLimit: 5,
    voteMultiplierLimit: 0,
    canCreatePaidChallenges: true,
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
    activeChallengeLimit: 1000,
    privateChallengeLimit: 1000,
    dailyFreeVoteLimit: 1,
    monthlyBoostLimit: 5,
    voteMultiplierLimit: 0,
    canCreatePaidChallenges: true,
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
    sponsorCampaignLimit: 5
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
    sponsorCampaignLimit: 20
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
    sponsorCampaignLimit: 200
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
  const normalizedPlanId = normalizePlanId(profile.planId ?? profile.subscriptionPlan);
  const rawStatus = profile.planStatus ?? profile.subscriptionStatus ?? profile.stripeStatus;
  const status = typeof rawStatus === "string" ? rawStatus as PlanStatus : normalizedPlanId === "free" ? "active" : "inactive";
  const active = ["active", "trial", "trialing", "payment_warning_1", "payment_warning_2"].includes(status);
  const base = active ? accessByPlan[normalizedPlanId] : accessByPlan.free;
  return {
    ...base,
    accountType: normalizeAccountType({ ...profile, planId: normalizedPlanId }),
    planStatus: status,
    activeChallengeLimit: base.activeChallengeLimit,
    privateChallengeLimit: base.privateChallengeLimit,
    dailyFreeVoteLimit: base.dailyFreeVoteLimit,
    monthlyBoostLimit: base.monthlyBoostLimit,
    voteMultiplierLimit: base.voteMultiplierLimit,
    sponsorCampaignLimit: base.sponsorCampaignLimit
  };
}

function hasActivePersonalPlan(status: string) {
  return ["active", "trial", "trialing", "payment_warning_1", "payment_warning_2"].includes(status.toLowerCase());
}

export function getPersonalCapabilities(profile: Record<string, unknown> = {}): PersonalCapabilities {
  const requestedPlan = normalizePlanId(profile.planId ?? profile.subscriptionPlan);
  const historicalPlan = normalizePlanId(profile.previousPlanId ?? profile.legacyPlanId ?? requestedPlan);
  const accountType = normalizeAccountType(profile);
  const rawStatus = profile.planStatus ?? profile.subscriptionStatus ?? profile.stripeStatus;
  const status = typeof rawStatus === "string" ? rawStatus : requestedPlan === "free" ? "active" : "inactive";
  const active = hasActivePersonalPlan(status);
  const visiblePlan = requestedPlan === "pro" ? "creator" : requestedPlan;
  const creator = active && visiblePlan === "creator";
  const host = active && (visiblePlan === "host" || visiblePlan === "enterprise");
  const personal = accountType !== "sponsor";
  const hadPremiumPersonalPlan = personal && [requestedPlan, historicalPlan].some((plan) => ["creator", "pro", "host", "enterprise"].includes(plan));

  return {
    canCreateNormalChallenge: personal,
    normalChallengeQuota: host
      ? { limit: null, period: "month" }
      : creator
        ? { limit: 3, period: "month" }
        : { limit: 3, period: "lifetime" },
    canCreatePrivateChallenge: personal && (creator || host),
    privateChallengeQuota: host ? { limit: null, period: "month" } : { limit: creator ? 1 : 0, period: "month" },
    canCreateTournament: personal && (creator || host),
    tournamentQuota: host ? { limit: null, period: "month" } : { limit: creator ? 1 : 0, period: "month" },
    canCreateLiveEvent: personal && host,
    liveEventQuota: { limit: host ? null : 0, period: "month" },
    monthlyBoostQuota: host ? 5 : creator ? 2 : 0,
    canUseCreatorAnalytics: personal && (creator || host),
    canReceiveNewSponsorProposals: personal && (creator || host),
    canManageExistingSponsorObligations: personal && (creator || host || hadPremiumPersonalPlan),
    canManageParticipants: personal,
    canManageVoting: personal,
    canManageHostOperations: personal && host,
    canManageExistingPremiumChallenges: personal && (creator || host || hadPremiumPersonalPlan),
    canUseTeam: personal && host,
    canWithdraw: personal
  };
}

export function getPlanExperience(profile: Record<string, unknown> = {}): PlanExperience {
  const access = getUserPlanAccess(profile);
  const active = ["active", "trial", "trialing", "payment_warning_1", "payment_warning_2"].includes(access.planStatus);
  if (access.accountType === "sponsor") {
    const sponsorPlan = active && sponsorPlanOrder.includes(access.normalizedPlanId as SponsorProductPlanId)
      ? access.normalizedPlanId
      : "sponsor_starter";
    const experience = planExperiences[sponsorPlan];
    if (active && access.normalizedPlanId !== "free") return experience;
    return {
      ...experience,
      badgeLabel: "Sponsor Account",
      challengeLimitLabel: "Sponsor tools require an active sponsor plan",
      teamMemberLimit: 0,
      features: { ...noFeatures, sponsor_command_center: true }
    };
  }
  const visiblePlan = access.normalizedPlanId === "pro" ? "creator" : access.normalizedPlanId;
  return planExperiences[active ? visiblePlan : "free"];
}

export function getEffectiveTier(profile: Record<string, unknown> = {}): EffectiveTier {
  const planId = normalizePlanId(profile.planId ?? profile.subscriptionPlan);
  const rawStatus = profile.planStatus ?? profile.subscriptionStatus ?? profile.stripeStatus;
  const status = typeof rawStatus === "string" ? rawStatus.toLowerCase() : planId === "free" ? "active" : "inactive";
  const paid = planId !== "free" && ["active", "trial", "trialing", "payment_warning_1", "payment_warning_2"].includes(status);
  const accountIntent = String(
    profile.selectedAccountType
      ?? profile.account_type
      ?? profile.roleIntent
      ?? profile.role
      ?? profile.accountType
      ?? "user"
  ).toLowerCase();

  if (accountIntent === "sponsor" || accountIntent === "brand" || sponsorPlanOrder.includes(planId as SponsorProductPlanId)) {
    return {
      id: "sponsor",
      planId: paid ? planId : "free",
      accountIntent: "sponsor",
      paid,
      displayName: paid ? planExperiences[planId].badgeLabel : "Sponsor Account",
      badgeLabel: paid ? planExperiences[planId].badgeLabel : "Sponsor Account",
      memberLabel: paid ? `${planExperiences[planId].badgeLabel} Member` : "Sponsor Setup",
      dashboardName: "Brand Command Center",
      dashboardSubtitle: "Complete brand approval and subscription setup to unlock sponsor tools."
    };
  }

  if (paid) {
    const visiblePlanId = planId === "pro" ? "creator" : planId;
    const experience = planExperiences[visiblePlanId];
    const id = visiblePlanId === "creator" || visiblePlanId === "host" || visiblePlanId === "enterprise" ? visiblePlanId : "free_competitor";
    const paidDisplayName = visiblePlanId === "host" ? "Host Plan" : `${experience.badgeLabel} Plan`;
    const paidMemberLabel = visiblePlanId === "host" ? "Host" : `${experience.badgeLabel} Member`;
    return {
      id,
      planId: visiblePlanId,
      accountIntent,
      paid: true,
      displayName: paidDisplayName,
      badgeLabel: paidDisplayName,
      memberLabel: paidMemberLabel,
      dashboardName: experience.dashboardName,
      dashboardSubtitle: experience.dashboardSubtitle
    };
  }

  if (accountIntent === "creator") {
    return {
      id: "creator_starter",
      planId: "free",
      accountIntent,
      paid: false,
      displayName: "Creator Starter",
      badgeLabel: "Creator Starter",
      memberLabel: "Free Creator",
      dashboardName: "Creator Starter",
      dashboardSubtitle: "Create up to three lifetime basic public challenges, explore competitions, and upgrade when you're ready for full creator tools."
    };
  }

  if (accountIntent === "host") {
    return {
      id: "host_starter",
      planId: "free",
      accountIntent,
      paid: false,
      displayName: "Host Starter",
      badgeLabel: "Host Starter",
      memberLabel: "Starter Access",
      dashboardName: "Host Starter",
      dashboardSubtitle: "Create up to three lifetime basic public challenges while you prepare for full host tools."
    };
  }

  return {
    id: "free_competitor",
    planId: "free",
    accountIntent,
    paid: false,
    displayName: "Free Competitor",
    badgeLabel: "Free Competitor",
    memberLabel: "Free Member",
    dashboardName: "Competitor Dashboard",
    dashboardSubtitle: "Compete, vote, and follow your progress."
  };
}

export function canAccessPlanFeature(profile: Record<string, unknown>, feature: PlanFeature) {
  return getPlanExperience(profile).features[feature];
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
  const capabilities = getPersonalCapabilities(profile);
  void activeChallengeCount;
  const publishing = Boolean(challengeInput.publish) || !["", "draft"].includes(String(challengeInput.status ?? "").toLowerCase());
  if (!publishing) return { allowed: true, code: null, message: "Drafts are allowed." };
  if (access.isSponsor) return { allowed: false, code: "USER_ACCOUNT_REQUIRED", message: "Sponsors manage campaigns from the Brand Command Center. Challenge creation is available from a personal Creator or Host workspace." };

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
  const ranked = format.includes("ranked");
  const oneVsOne = format.includes("1 vs 1") || format.includes("1v1") || format.includes("head-to-head");
  const liveEvent = format.includes("live event");
  const enterpriseProgram = format.includes("program") || format.includes("campaign");
  const prize = prizePool > 0 || Boolean(challengeInput.prizePoolEnabled || challengeInput.cashPayoutsEnabled) || (prizeType && !prizeType.includes("bragging"));

  if (tournament && !capabilities.canCreateTournament) return { allowed: false, code: "CREATOR_REQUIRED", message: "Tournament creation requires Creator or Host access." };
  if (enterpriseProgram && !access.isEnterprise) return { allowed: false, code: "ENTERPRISE_REQUIRED", message: "Program and campaign challenge builders require Enterprise access." };
  if ((oneVsOne || liveEvent) && !capabilities.canCreateLiveEvent) return { allowed: false, code: "HOST_REQUIRED", message: "Live-event challenge tools require Host access." };
  if (ranked && !capabilities.canCreateTournament) return { allowed: false, code: "CREATOR_REQUIRED", message: "Ranked competition tools require Creator or Host access." };
  if (paid && !access.canCreatePaidChallenges) return { allowed: false, code: "CREATOR_REQUIRED", message: "Creator plan or higher is required to submit paid-entry challenges for review." };
  if (privateChallenge && !capabilities.canCreatePrivateChallenge) return { allowed: false, code: "CREATOR_REQUIRED", message: "Creator or Host access is required to publish private challenges." };
  if (premiumOnly && !capabilities.canCreatePrivateChallenge) return { allowed: false, code: "CREATOR_REQUIRED", message: "Creator or Host access is required to publish restricted challenges." };
  if (prize && !access.canCreatePrizeChallenges) return { allowed: false, code: "CREATOR_REQUIRED", message: "Creator plan or higher is required to publish sponsor-funded prize or product-prize challenges." };
  if (sponsored && !access.canCreateSponsoredChallenges) return { allowed: false, code: "CREATOR_REQUIRED", message: "Creator plan or higher is required to publish sponsor-ready challenges." };

  return { allowed: true, code: null, message: "Challenge can be created." };
}

export function getVoteWeight(profile: Record<string, unknown> = {}, weightedVotes = true) {
  void profile;
  void weightedVotes;
  return 1;
}
