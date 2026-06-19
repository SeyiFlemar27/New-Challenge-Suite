import type { SubscriptionPlan, UserPlanId } from "@/lib/types";

export const subscriptionPlans: SubscriptionPlan[] = [
  {
    id: "observer",
    name: "Observer",
    audience: "creator",
    subtitle: "Free Tier",
    priceMonthly: 0,
    stripePriceEnv: "",
    features: ["View public challenges", "1 free vote per challenge/day", "Comment on public challenges", "Create 1 free group challenge/month", "Participate in group challenges"],
    canHostLiveEvents: false,
    liveEventCapacity: 0,
    canManageTournaments: false,
    canCreatePrizeChallenges: false
  },
  {
    id: "creator",
    name: "Creator",
    audience: "creator",
    subtitle: "For active users",
    priceMonthly: 24.99,
    stripePriceEnv: "STRIPE_PRICE_CREATOR",
    features: ["60 votes/month + 1 Multiplier", "Create up to 3 group challenges/mo", "Prize Pools up to $500", "1 Challenge Boost/month", "Comment & pin 1 comment"],
    canHostLiveEvents: false,
    liveEventCapacity: 0,
    canManageTournaments: false,
    canCreatePrizeChallenges: true
  },
  {
    id: "competitor",
    name: "Competitor",
    audience: "creator",
    subtitle: "Serious creators",
    priceMonthly: 59.99,
    stripePriceEnv: "STRIPE_PRICE_COMPETITOR",
    features: ["200 votes + 3 Multipliers", "Unlimited free group challenges", "Prize Pools up to $2,500 + Host 1v1", "Access to Ranked Challenges", "Host Small Live Events (10 pax)"],
    canHostLiveEvents: true,
    liveEventCapacity: 10,
    canManageTournaments: false,
    canCreatePrizeChallenges: true,
    recommended: true
  },
  {
    id: "executive_host",
    name: "Executive Host",
    audience: "creator",
    subtitle: "Event organizers",
    priceMonthly: 119,
    stripePriceEnv: "STRIPE_PRICE_EXECUTIVE_HOST",
    features: ["500 votes + 5 Multipliers", "Prize Pools up to $10,000", "Create Tournament Brackets & 1v1", "Unlimited Challenge Boosts", "Host Mid-Scale Live Events (15 pax)"],
    canHostLiveEvents: true,
    liveEventCapacity: 15,
    canManageTournaments: true,
    canCreatePrizeChallenges: true
  },
  {
    id: "chief_producer",
    name: "Chief Producer",
    audience: "creator",
    subtitle: "Culture architect",
    priceMonthly: 249,
    stripePriceEnv: "STRIPE_PRICE_CHIEF_PRODUCER",
    features: ["1,500 votes + Unlimited Multipliers", "Unlimited prize pools & events", "Sponsor-integrated challenges", "Tier-Restricted Special Events", "Host Large Live Events (25 pax)"],
    canHostLiveEvents: true,
    liveEventCapacity: 25,
    canManageTournaments: true,
    canCreatePrizeChallenges: true
  },
  {
    id: "brand_partner",
    name: "Brand Partner",
    audience: "sponsor",
    subtitle: "Sponsor growth",
    priceMonthly: 499,
    stripePriceEnv: "STRIPE_PRICE_BRAND_PARTNER",
    features: ["Sponsor up to 5 challenges", "Brand badge on listings", "Custom CTA button", "Engagement dashboard", "Access to sponsor-only placements"],
    canHostLiveEvents: false,
    liveEventCapacity: 0,
    canManageTournaments: false,
    canCreatePrizeChallenges: false
  },
  {
    id: "enterprise_sponsor",
    name: "Enterprise Sponsor",
    audience: "sponsor",
    subtitle: "Enterprise campaigns",
    priceMonthly: 1250,
    stripePriceEnv: "STRIPE_PRICE_ENTERPRISE_SPONSOR",
    features: ["Unlimited sponsored challenges", "Logo on challenge feed", "Weekly Featured Sponsor banner", "Direct ROI analytics", "Co-branded live event integration"],
    canHostLiveEvents: false,
    liveEventCapacity: 0,
    canManageTournaments: false,
    canCreatePrizeChallenges: false
  }
];

export type PaidSubscriptionPlanId = Exclude<UserPlanId, "observer">;

export function getSubscriptionPlan(planId: unknown) {
  if (typeof planId !== "string") return null;
  const plan = subscriptionPlans.find((item) => item.id === planId);
  return plan && plan.priceMonthly > 0 ? plan : null;
}

export function getSubscriptionPlansForUser(currentPlanId: unknown) {
  const normalizedPlanId = typeof currentPlanId === "string" ? currentPlanId : "observer";
  return subscriptionPlans.map((plan) => ({
    ...plan,
    current: plan.id === normalizedPlanId
  }));
}
