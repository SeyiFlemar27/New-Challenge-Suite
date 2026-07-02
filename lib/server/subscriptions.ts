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
    features: ["View public challenges", "1 free vote per challenge/day", "Comment on public challenges", "Create 1 free group challenge/month", "Participate in group challenges"],
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
    features: ["60 votes/month + 1 Multiplier", "Create up to 3 group challenges/mo", "Prize foundation review up to $500", "1 Challenge Boost/month", "Comment & pin 1 comment"],
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
    features: ["200 votes + 3 Multipliers", "Unlimited free group challenges", "Prize foundation review up to $2,500 + Host 1v1", "Access to Ranked Challenges", "Host Small Live Events (10 pax)"],
    canHostLiveEvents: true,
    liveEventCapacity: 10,
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
    features: ["500 votes + 5 Multipliers", "Prize foundation review up to $10,000", "Create Tournament Brackets & 1v1", "Unlimited Challenge Boosts", "Host Mid-Scale Live Events (15 pax)"],
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
    features: ["1,500 votes + Unlimited Multipliers", "Prize pool foundation tools & events", "Sponsor/prize review tools", "Tier-Restricted Special Events", "Host Large Live Events (25 pax)"],
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
    features: ["Sponsor campaign workspace", "Brand profile tools", "Sponsor challenge discovery", "Review-only contribution requests"],
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
    features: ["Sponsor up to 5 challenges", "Brand badge on listings", "Custom CTA button", "Engagement dashboard", "Access to sponsor-only placements"],
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
    features: ["Unlimited sponsored challenges", "Logo on challenge feed", "Weekly Featured Sponsor banner", "Campaign performance insights", "Co-branded live event integration"],
    canHostLiveEvents: false,
    liveEventCapacity: 0,
    canManageTournaments: false,
    canCreatePrizeChallenges: false
  }
];

export type PaidSubscriptionPlanId = Exclude<ProductPlanId, "free">;

export function getSubscriptionPlan(planId: unknown) {
  if (typeof planId !== "string") return null;
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
