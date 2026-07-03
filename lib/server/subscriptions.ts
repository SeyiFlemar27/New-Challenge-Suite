import { normalizePlanId } from "@/lib/plan-access";
import type { AccountType, ProductPlanId, SubscriptionPlan } from "@/lib/types";

export const subscriptionPlans: SubscriptionPlan[] = [
  {
    id: "free",
    name: "Free",
    audience: "user",
    subtitle: "Start competing",
    priceMonthly: 0,
    priceMonthlyLabel: "$0/month",
    stripePriceEnv: "",
    features: ["Explore and join public challenges", "1 basic public challenge/month", "Public voting and leaderboard access", "Private, sponsor, boost, and analytics tools locked"],
    canHostLiveEvents: false,
    liveEventCapacity: 0,
    canManageTournaments: false,
    canCreatePrizeChallenges: false
  },
  {
    id: "creator",
    name: "Creator",
    audience: "user",
    subtitle: "For active users",
    priceMonthly: 24.99,
    priceMonthlyLabel: "$24.99/month",
    stripePriceEnv: "STRIPE_PRICE_CREATOR",
    legacyStripePriceEnvs: ["STRIPE_CREATOR_PRICE_ID"],
    features: ["Creator Studio dashboard", "3 challenges/month + 1 private challenge/month", "Sponsor-enabled challenge tools", "Basic creator analytics", "1 Challenge Boost/month", "Read-only earnings review foundation"],
    canHostLiveEvents: false,
    liveEventCapacity: 0,
    canManageTournaments: false,
    canCreatePrizeChallenges: true
  },
  {
    id: "pro",
    name: "Pro",
    audience: "user",
    subtitle: "Serious creators",
    priceMonthly: 59.99,
    priceMonthlyLabel: "$59.99/month",
    stripePriceEnv: "STRIPE_PRICE_PRO",
    legacyStripePriceEnvs: ["STRIPE_PRICE_COMPETITOR", "STRIPE_PRO_PRICE_ID"],
    features: ["Performance Hub dashboard", "Unlimited basic/group challenges + 5 private/month", "Ranked challenges and ranking history", "Performance analytics and highlighted submissions", "3 Challenge Boosts/month + vote multipliers", "Join tournament previews"],
    canHostLiveEvents: false,
    liveEventCapacity: 0,
    canManageTournaments: false,
    canCreatePrizeChallenges: true,
    recommended: true
  },
  {
    id: "host",
    name: "Host",
    audience: "user",
    subtitle: "Event organizers",
    priceMonthly: 119,
    priceMonthlyLabel: "$119/month",
    stripePriceEnv: "STRIPE_PRICE_HOST",
    legacyStripePriceEnvs: ["STRIPE_PRICE_EXECUTIVE_HOST", "STRIPE_HOST_PRICE_ID"],
    features: ["Host Control Center", "Unlimited public/private challenges", "Tournament, 1v1, and live-event foundations", "Participant, submission, and voting controls", "Sponsor proposals, reports, and exports", "Team foundation for up to 3 members"],
    canHostLiveEvents: true,
    liveEventCapacity: 15,
    canManageTournaments: true,
    canCreatePrizeChallenges: true
  },
  {
    id: "enterprise",
    name: "Enterprise",
    audience: "user",
    subtitle: "Culture architect",
    priceMonthly: 249,
    priceMonthlyLabel: "$249/month",
    stripePriceEnv: "STRIPE_PRICE_ENTERPRISE",
    legacyStripePriceEnvs: ["STRIPE_PRICE_CHIEF_PRODUCER", "STRIPE_ENTERPRISE_PRICE_ID"],
    features: ["Enterprise Command Center", "Programs, campaigns, and large-tournament foundations", "Multi-admin team foundation", "Custom branded page foundations", "Reports, exports, and integration placeholders", "Dedicated support placeholder"],
    canHostLiveEvents: true,
    liveEventCapacity: 25,
    canManageTournaments: true,
    canCreatePrizeChallenges: true
  },
  {
    id: "sponsor_starter",
    name: "Sponsor Starter",
    audience: "sponsor",
    subtitle: "Start sponsoring",
    priceMonthly: null,
    priceMonthlyLabel: "Configured in Stripe",
    stripePriceEnv: "STRIPE_PRICE_SPONSOR_STARTER",
    legacyStripePriceEnvs: ["STRIPE_SPONSOR_STARTER_PRICE_ID"],
    features: ["Brand Command Center", "2 campaign workspaces", "Brand profile and sponsor-ready discovery", "Review-only contribution requests", "Single team seat"],
    canHostLiveEvents: false,
    liveEventCapacity: 0,
    canManageTournaments: false,
    canCreatePrizeChallenges: false
  },
  {
    id: "brand_partner",
    name: "Brand Partner",
    audience: "sponsor",
    subtitle: "Sponsor growth",
    priceMonthly: 499,
    priceMonthlyLabel: "$499/month",
    stripePriceEnv: "STRIPE_PRICE_BRAND_PARTNER",
    legacyStripePriceEnvs: ["STRIPE_BRAND_PARTNER_PRICE_ID"],
    features: ["Brand Command Center", "10 campaign workspaces", "Placements and audience insights", "Reports and exports", "Team foundation for up to 5 members"],
    canHostLiveEvents: false,
    liveEventCapacity: 0,
    canManageTournaments: false,
    canCreatePrizeChallenges: false
  },
  {
    id: "enterprise_partner",
    name: "Enterprise Partner",
    audience: "sponsor",
    subtitle: "Enterprise campaigns",
    priceMonthly: 1250,
    priceMonthlyLabel: "$1,250/month",
    stripePriceEnv: "STRIPE_PRICE_ENTERPRISE_PARTNER",
    legacyStripePriceEnvs: ["STRIPE_PRICE_ENTERPRISE_SPONSOR", "STRIPE_ENTERPRISE_PARTNER_PRICE_ID"],
    features: ["Enterprise Brand Command Center", "Unlimited campaign workspaces", "Enterprise placements and branded-page foundations", "Advanced reports and exports", "Team foundation for up to 25 members", "Integration placeholders"],
    canHostLiveEvents: false,
    liveEventCapacity: 0,
    canManageTournaments: false,
    canCreatePrizeChallenges: false
  }
];

export type PaidSubscriptionPlanId = Exclude<ProductPlanId, "free">;

const legacyCheckoutPlanIds = new Set([
  "observer",
  "premium",
  "creator_pro",
  "verified_host",
  "competitor",
  "executive_host",
  "chief_producer",
  "enterprise_sponsor"
]);

export function getSubscriptionPlan(planId: unknown) {
  if (typeof planId !== "string") return null;
  const knownPlan = subscriptionPlans.some((item) => item.id === planId) || legacyCheckoutPlanIds.has(planId);
  if (!knownPlan) return null;
  const normalizedPlanId = normalizePlanId(planId);
  return subscriptionPlans.find((item) => item.id === normalizedPlanId) ?? null;
}

export function getSubscriptionPlansForUser(currentPlanId: unknown, accountType: Exclude<AccountType, "admin">) {
  const normalizedPlanId = normalizePlanId(currentPlanId);
  return subscriptionPlans.map((plan) => ({
    ...plan,
    current: plan.id === normalizedPlanId,
    stripeConfigured: Boolean(resolveStripePriceEnv(plan).priceId),
    checkoutAvailable: plan.id !== "free" && Boolean(resolveStripePriceEnv(plan).priceId),
    purchaseAllowed: plan.audience === accountType
  }));
}

export function resolveStripePriceEnv(plan: { id: string; stripePriceEnv?: string; legacyStripePriceEnvs?: string[] }) {
  const candidates = [
    plan.stripePriceEnv,
    ...(plan.legacyStripePriceEnvs ?? [])
  ].filter(Boolean) as string[];
  const envName = candidates.find((name) => Boolean(process.env[name])) ?? candidates[0] ?? "";
  return { envName, priceId: envName ? process.env[envName] : undefined, candidates };
}
