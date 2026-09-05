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
    features: ["Explore and join public challenges", "3 lifetime Free Basic Challenges", "Public voting and leaderboard access", "Private, sponsor, boost, and analytics tools locked"],
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
    features: ["Creator Studio dashboard", "3 normal challenges/month + 1 private challenge/month + 1 tournament/month", "Sponsor-enabled challenge tools", "Creator analytics", "2 Challenge Boosts/month", "Read-only earnings review foundation"],
    canHostLiveEvents: false,
    liveEventCapacity: 0,
    canManageTournaments: true,
    canCreatePrizeChallenges: true
  },
  {
    id: "pro",
    name: "Creator",
    audience: "user",
    subtitle: "Legacy Creator compatibility",
    priceMonthly: 59.99,
    priceMonthlyLabel: "$59.99/month",
    stripePriceEnv: "STRIPE_PRICE_PRO",
    legacyStripePriceEnvs: ["STRIPE_PRICE_COMPETITOR", "STRIPE_PRO_PRICE_ID"],
    features: ["Legacy Creator subscription compatibility"],
    canHostLiveEvents: false,
    liveEventCapacity: 0,
    canManageTournaments: true,
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
    features: ["Host Control Center", "Unlimited normal, private, tournament, and live-event challenges", "5 Challenge Boosts/month", "Tournament and live-event operations", "Participant, submission, and voting controls", "Sponsor proposals, reports, and exports", "Team foundation for up to 3 members"],
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
    features: ["Enterprise Command Center", "Unlimited challenge campaigns", "Large-scale tournament foundations", "Multi-host/team workspace", "Private/exclusive campaign tools", "Custom sponsor/partner activations", "Branded challenge hub", "Advanced reporting and exports", "Revenue-share reporting", "Live event operations", "Custom voting/judging rules", "API/integration foundation", "Compliance/KYC workflow support", "Priority support", "Onboarding and launch support", "Custom contract/invoicing"],
    canHostLiveEvents: true,
    liveEventCapacity: 25,
    canManageTournaments: true,
    canCreatePrizeChallenges: true
  },
  {
    id: "sponsor_starter",
    name: "Sponsor Starter",
    audience: "sponsor",
    subtitle: "For small businesses and first-time sponsors",
    priceMonthly: null,
    priceMonthlyLabel: "Plan pricing managed in Stripe",
    stripePriceEnv: "STRIPE_PRICE_SPONSOR_STARTER",
    legacyStripePriceEnvs: ["STRIPE_SPONSOR_STARTER_PRICE_ID"],
    features: ["Sponsor dashboard", "Verified brand profile eligibility", "Up to 5 active sponsored challenges per month", "Basic campaign brief foundation", "Logo placement and one CTA", "Basic analytics foundation", "One team member", "Email support"],
    canHostLiveEvents: false,
    liveEventCapacity: 0,
    canManageTournaments: false,
    canCreatePrizeChallenges: false
  },
  {
    id: "brand_partner",
    name: "Brand Partner",
    audience: "sponsor",
    subtitle: "For brands scaling creator and challenge partnerships",
    priceMonthly: 499,
    priceMonthlyLabel: "Plan pricing managed in Stripe",
    stripePriceEnv: "STRIPE_PRICE_BRAND_PARTNER",
    legacyStripePriceEnvs: ["STRIPE_BRAND_PARTNER_PRICE_ID"],
    features: ["Everything in Sponsor Starter", "Up to 20 active sponsored challenges per month", "Advanced campaign brief foundation", "Audience targeting foundation", "Creator comparison foundation", "Advanced analytics foundation", "CSV/PDF report foundation", "Five team members", "Priority support"],
    canHostLiveEvents: false,
    liveEventCapacity: 0,
    canManageTournaments: false,
    canCreatePrizeChallenges: false
  },
  {
    id: "enterprise_partner",
    name: "Enterprise Partner",
    audience: "sponsor",
    subtitle: "For enterprise programs and agency partnerships",
    priceMonthly: null,
    priceMonthlyLabel: "Custom pricing",
    stripePriceEnv: "STRIPE_PRICE_ENTERPRISE_PARTNER",
    legacyStripePriceEnvs: ["STRIPE_PRICE_ENTERPRISE_SPONSOR", "STRIPE_ENTERPRISE_PARTNER_PRICE_ID"],
    features: ["Everything in Brand Partner", "Unlimited active campaigns", "Premium homepage placements", "Tournament and event sponsorship", "Dedicated brand landing page", "Custom KPI dashboard foundation", "API/webhook access foundation", "Unlimited team members", "Dedicated account manager"],
    canHostLiveEvents: false,
    liveEventCapacity: 0,
    canManageTournaments: false,
    canCreatePrizeChallenges: false
  }];

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
  return subscriptionPlans.filter((plan) => plan.id !== "pro").map((plan) => ({
    ...plan,
    current: plan.id === normalizedPlanId,
    stripeConfigured: Boolean(resolveStripePriceEnv(plan).priceId),
    checkoutAvailable: plan.id !== "free" && plan.id !== "enterprise" && Boolean(resolveStripePriceEnv(plan).priceId),
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
