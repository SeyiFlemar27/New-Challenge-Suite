import type { SponsorProductPlanId } from "@/lib/types";

export type SponsorVerificationStatus =
  | "not_started"
  | "in_progress"
  | "submitted"
  | "under_review"
  | "additional_information_required"
  | "verified"
  | "rejected"
  | "flagged";

export const sponsorPlanCards: Array<{
  id: SponsorProductPlanId;
  name: string;
  positioning: string;
  summary: string;
  cta: string;
  featured?: boolean;
  checkout: "stripe" | "sales";
  highlights: string[];
  comparison: string[];
}> = [
  {
    id: "sponsor_starter",
    name: "Sponsor Starter",
    positioning: "For small businesses, startups, local brands, and first-time sponsors.",
    summary: "Launch a verified brand presence and prepare focused sponsorship collaborations.",
    cta: "Start Sponsor Setup",
    checkout: "stripe",
    highlights: ["Verified brand profile eligibility", "Up to 5 active sponsored challenges per month", "Basic campaign briefs", "Logo placement and one CTA", "Basic campaign analytics", "One team member"],
    comparison: ["Sponsor dashboard", "Browse creator marketplace foundation", "Browse challenge marketplace foundation", "Send sponsorship proposals foundation", "Receive creator proposals foundation", "Save creators and challenges foundation", "Brand asset uploads", "Email support"]
  },
  {
    id: "brand_partner",
    name: "Brand Partner",
    positioning: "For growing brands that need richer targeting, collaboration, and reporting foundations.",
    summary: "Coordinate more campaigns, compare creators, and prepare advanced sponsor activations.",
    cta: "Choose Brand Partner",
    checkout: "stripe",
    featured: true,
    highlights: ["Up to 20 active sponsored challenges per month", "Advanced campaign brief foundation", "Audience targeting foundation", "Direct creator messaging foundation", "Advanced analytics foundation", "Five team members"],
    comparison: ["Creator comparison foundation", "Proposal negotiation foundation", "Campaign templates", "Multiple campaign CTA buttons", "Sponsor video uploads", "Leaderboard, voting, and winner announcement branding", "CSV/PDF report foundations", "UTM tracking foundation", "Priority support"]
  },
  {
    id: "enterprise_partner",
    name: "Enterprise Partner",
    positioning: "For national brands, agencies, and enterprise partnerships requiring custom programs.",
    summary: "Plan large-scale sponsor programs, premium placements, integrations, and custom reporting.",
    cta: "Contact Sales",
    checkout: "sales",
    highlights: ["Unlimited active campaigns", "Premium homepage placements", "Tournament and event sponsorship", "Dedicated brand landing page", "Custom KPI dashboard foundation", "Dedicated account manager"],
    comparison: ["Unlimited creator collaborations", "Unlimited proposals", "Challenge naming rights", "Exclusive category sponsorship", "Custom brand campaign URL", "API and webhook access foundation", "CRM integration foundation", "Unlimited team members", "Approval chains foundation", "Audit logs", "SSO readiness", "Custom onboarding"]
  }
];

export const sponsorGoals = ["Brand awareness", "Product launch", "App installs", "Lead generation", "Sales", "Community growth", "Audience engagement", "Event promotion", "Creator collaboration", "User acquisition"];
export const sponsorCategories = ["Music", "Dance", "Fitness", "Fashion", "Gaming", "Food", "Beauty", "Sports", "Business", "Education", "Lifestyle", "Technology"];
export const sponsorIndustries = ["Consumer goods", "Beauty", "Fashion", "Food and beverage", "Sports", "Entertainment", "Technology", "Education", "Health and fitness", "Local business", "Nonprofit", "Agency"];
export const sponsorCompanySizes = ["1-10", "11-50", "51-200", "201-1000", "1000+"];
export const sponsorBusinessTypes = ["Startup", "Small business", "Enterprise", "Agency", "Nonprofit", "Creator brand", "Local venue", "Other"];
export const sponsorBudgetRanges = ["Under $1,000", "$1,000-$5,000", "$5,000-$25,000", "$25,000-$100,000", "$100,000+", "Not sure yet"];
export const sponsorCampaignDurations = ["1-2 weeks", "1 month", "Quarterly", "Seasonal", "Always-on", "Custom"];
export const sponsorCtaLabels = ["Learn More", "Shop Now", "Download App", "Join Challenge", "Claim Offer", "Book Now", "Visit Website"];
export const sponsorToneOptions = ["Professional", "Playful", "Premium", "Community-first", "Bold", "Educational", "Inspirational"];
export const sponsorVerificationDocuments = ["Certificate of incorporation", "Business registration document", "Tax document", "Authorized representative identification", "Business address proof"];

export const sponsorOnboardingSteps = [
  { id: "business", title: "Business Information", description: "Confirm the legal and public business basics for the brand account." },
  { id: "identity", title: "Brand Identity", description: "Upload brand assets and define the tone sponsors will use in campaigns." },
  { id: "goals", title: "Sponsorship Goals", description: "Choose the outcomes and challenge categories this brand wants to pursue." },
  { id: "audience", title: "Target Audience", description: "Capture the audience, location, language, and creator niche preferences." },
  { id: "budget", title: "Budget Preferences", description: "Set campaign planning preferences without moving sponsor money." },
  { id: "verification", title: "Business Verification", description: "Track business verification readiness and restricted actions." },
  { id: "summary", title: "Completion Summary", description: "Review the profile and next safe actions." }
] as const;

export const sponsorNavigationGroups = [
  { label: "Command", items: ["Overview", "Campaigns", "Approvals", "Deliverables"] },
  { label: "Discover", items: ["Creators", "Challenges", "Events", "Tournaments"] },
  { label: "Brand", items: ["Brand Assets", "Proposals", "Messages", "Contracts"] },
  { label: "Business", items: ["Wallet", "Analytics", "Reports", "Team", "Notifications", "Settings"] }
];

export function sponsorPlanLimitLabel(planId?: string | null) {
  if (planId === "enterprise_partner") return "Unlimited active campaigns";
  if (planId === "brand_partner") return "20 active sponsored challenges/month";
  if (planId === "sponsor_starter") return "5 active sponsored challenges/month";
  return "Choose a sponsor plan to unlock campaign capacity";
}

export function normalizeBusinessVerificationStatus(value: unknown): SponsorVerificationStatus {
  const normalized = String(value ?? "").trim().toLowerCase();
  if (["approved", "verified"].includes(normalized)) return "verified";
  if (["pending_review", "under_review"].includes(normalized)) return "under_review";
  if (["needs_changes", "additional_information_required"].includes(normalized)) return "additional_information_required";
  if (["rejected", "flagged", "submitted", "in_progress", "not_started"].includes(normalized)) return normalized as SponsorVerificationStatus;
  return "not_started";
}

export function businessVerificationLabel(status: SponsorVerificationStatus) {
  return status.replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

export function calculateSponsorCompletion(profile: Record<string, unknown> = {}) {
  const checks = [
    Boolean(profile.brandName), Boolean(profile.legalBusinessName), Boolean(profile.industry), Boolean(profile.website), Boolean(profile.businessEmail),
    Boolean(profile.logoUrl), Boolean(profile.bannerUrl), Boolean(profile.brandDescription), Array.isArray(profile.sponsorshipGoals) && profile.sponsorshipGoals.length > 0,
    Array.isArray(profile.preferredChallengeCategories) && profile.preferredChallengeCategories.length > 0, Boolean(profile.typicalCampaignBudget), Boolean(profile.targetCountries)
  ];
  return Math.round((checks.filter(Boolean).length / checks.length) * 100);
}