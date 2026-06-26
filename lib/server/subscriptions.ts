import type { ProductPlanId, SubscriptionPlan } from "@/lib/types";
import { normalizePlanId } from "@/lib/plan-access";

export const subscriptionPlans: SubscriptionPlan[] = [
  {
    id: "free",
    name: "Free",
    audience: "creator",
    subtitle: "Explore, vote, and create one simple challenge",
    priceMonthly: 0,
    stripePriceEnv: "",
    features: ["View and join public challenges", "1 free vote per challenge/day", "Create 1 basic public challenge", "Submit entries", "Basic profile"],
    canHostLiveEvents: false,
    liveEventCapacity: 0,
    canManageTournaments: false,
    canCreatePrizeChallenges: false
  },
  {
    id: "creator",
    name: "Creator",
    audience: "creator",
    subtitle: "Creator Studio for challenge builders",
    priceMonthly: 24.99,
    stripePriceEnv: "STRIPE_PRICE_CREATOR",
    legacyStripePriceEnvs: ["STRIPE_PRICE_CREATOR_PRO"],
    features: ["Create up to 3 challenges", "1 private challenge", "Sponsor-ready challenges", "Basic creator analytics", "Receive sponsor requests"],
    canHostLiveEvents: false,
    liveEventCapacity: 0,
    canManageTournaments: false,
    canCreatePrizeChallenges: true
  },
  {
    id: "pro",
    name: "Pro",
    audience: "creator",
    subtitle: "Performance Hub for serious competitors",
    priceMonthly: 59.99,
    stripePriceEnv: "STRIPE_PRICE_PRO",
    legacyStripePriceEnvs: ["STRIPE_PRICE_COMPETITOR", "STRIPE_PRICE_PREMIUM"],
    features: ["More challenge creation capacity", "Ranked challenge access", "Advanced profile", "Performance analytics", "More boosts and vote multipliers"],
    canHostLiveEvents: false,
    liveEventCapacity: 0,
    canManageTournaments: false,
    canCreatePrizeChallenges: true,
    recommended: true
  },
  {
    id: "host",
    name: "Host",
    audience: "creator",
    subtitle: "Competition and live event control",
    priceMonthly: 119,
    stripePriceEnv: "STRIPE_PRICE_HOST",
    legacyStripePriceEnvs: ["STRIPE_PRICE_EXECUTIVE_HOST", "STRIPE_PRICE_VERIFIED_HOST"],
    features: ["Host live events", "Manage tournaments", "Sponsor-ready competitions", "Advanced revenue reports", "Participant and submission controls"],
    canHostLiveEvents: true,
    liveEventCapacity: 100,
    canManageTournaments: true,
    canCreatePrizeChallenges: true
  },
  {
    id: "enterprise",
    name: "Enterprise",
    audience: "creator",
    subtitle: "Programs for organizations and teams",
    priceMonthly: 0,
    stripePriceEnv: "",
    legacyStripePriceEnvs: ["STRIPE_PRICE_CHIEF_PRODUCER"],
    features: ["Custom challenge programs", "Large live events", "Team workflows", "Custom reports", "Dedicated support"],
    canHostLiveEvents: true,
    liveEventCapacity: 1000,
    canManageTournaments: true,
    canCreatePrizeChallenges: true
  },
  {
    id: "sponsor_starter",
    name: "Sponsor Starter",
    audience: "sponsor",
    subtitle: "For small brands testing sponsorships",
    priceMonthly: 199,
    stripePriceEnv: "STRIPE_PRICE_SPONSOR_STARTER",
    features: ["Brand Command Center", "Sponsor challenge requests", "Basic placements", "Campaign activity summary", "Brand profile"],
    canHostLiveEvents: false,
    liveEventCapacity: 0,
    canManageTournaments: false,
    canCreatePrizeChallenges: false
  },
  {
    id: "brand_partner",
    name: "Brand Partner",
    audience: "sponsor",
    subtitle: "For active sponsors and growing brands",
    priceMonthly: 499,
    stripePriceEnv: "STRIPE_PRICE_BRAND_PARTNER",
    features: ["Multiple campaigns", "Sponsor marketplace access", "CTA placements", "Audience insights", "Sponsor reports"],
    canHostLiveEvents: false,
    liveEventCapacity: 0,
    canManageTournaments: false,
    canCreatePrizeChallenges: false,
    recommended: true
  },
  {
    id: "enterprise_partner",
    name: "Enterprise Partner",
    audience: "sponsor",
    subtitle: "For large brand and agency programs",
    priceMonthly: 1250,
    stripePriceEnv: "STRIPE_PRICE_ENTERPRISE_PARTNER",
    legacyStripePriceEnvs: ["STRIPE_PRICE_ENTERPRISE_SPONSOR"],
    features: ["Enterprise campaign support", "Large sponsor placements", "Advanced reports", "Team workflows", "Custom activation planning"],
    canHostLiveEvents: false,
    liveEventCapacity: 0,
    canManageTournaments: false,
    canCreatePrizeChallenges: false
  }
];

export type PaidSubscriptionPlanId = Exclude<ProductPlanId, "free" | "enterprise">;

export function getSubscriptionPlan(planId: unknown) {
  const normalizedPlanId = normalizePlanId(planId);
  const plan = subscriptionPlans.find((item) => item.id === normalizedPlanId);
  return plan && plan.priceMonthly > 0 ? plan : null;
}

export function getSubscriptionPlansForUser(currentPlanId: unknown) {
  const normalizedPlanId = normalizePlanId(currentPlanId);
  return subscriptionPlans.map((plan) => ({
    ...plan,
    current: plan.id === normalizedPlanId
  }));
}

export function resolveStripePriceEnv(plan: SubscriptionPlan) {
  const candidates = [plan.stripePriceEnv, ...(plan.legacyStripePriceEnvs ?? [])].filter(Boolean);
  const envName = candidates.find((candidate) => Boolean(process.env[candidate]));
  return {
    envName: envName ?? candidates[0] ?? "STRIPE_PRICE_ID",
    priceId: envName ? process.env[envName] : undefined,
    candidates
  };
}
