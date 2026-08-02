export const sponsorCampaignStatuses = [
  "draft",
  "ready_for_review",
  "submitted_for_review",
  "approved",
  "matching",
  "proposal_sent",
  "accepted",
  "funding_required",
  "funded",
  "live",
  "published",
  "inviting_creators",
  "proposal_open",
  "negotiating",
  "awaiting_contract",
  "awaiting_funding",
  "scheduled",
  "active",
  "paused",
  "completed",
  "cancelled",
  "archived"
] as const;

export type SponsorCampaignStatus = typeof sponsorCampaignStatuses[number];

export const sponsorCampaignBuilderSteps = [
  { id: "basics", title: "Campaign Basics", description: "Define the campaign, objective, category, and timeline." },
  { id: "audience_goals", title: "Audience & Goals", description: "Describe the audience, creator fit, and intended outcome." },
  { id: "budget_type", title: "Budget & Sponsorship Type", description: "Plan the budget and sponsorship structure without moving funds." },
  { id: "deliverables_rules", title: "Deliverables & Brand Rules", description: "Set deliverables, media requirements, brand rules, and approval expectations." },
  { id: "review", title: "Review & Submit", description: "Review the brief, save a draft, or submit it for review." }
] as const;

export const sponsorCampaignObjectives = ["Brand awareness", "Product launch", "App installs", "Lead generation", "Sales", "Community growth", "Audience engagement", "Event promotion", "Creator collaboration", "User acquisition"];
export const sponsorCampaignCategories = ["Music", "Dance", "Fitness", "Fashion", "Gaming", "Food", "Beauty", "Sports", "Business", "Education", "Lifestyle", "Technology"];
export const campaignVisibilityOptions = ["draft", "private_invite_only", "marketplace_visible_later"];
export const campaignPaymentStructures = ["full_payment", "milestone_payment", "custom_payment_structure"];
export const creatorRequirementCategories = ["Creator", "Host", "Judge", "Athlete", "Performer", "Educator", "Venue", "Community leader"];
export const deliverableExamples = ["Challenge launch video", "Promotional post", "Campaign banner", "Leaderboard sponsor placement", "Voting page sponsor placement", "Winner announcement video", "Event appearance", "Final analytics report"];

export function normalizeSponsorCampaignStatus(value: unknown): SponsorCampaignStatus {
  const normalized = String(value ?? "draft").trim().toLowerCase();
  return sponsorCampaignStatuses.includes(normalized as SponsorCampaignStatus) ? normalized as SponsorCampaignStatus : "draft";
}

export function campaignStatusLabel(status: unknown) {
  return normalizeSponsorCampaignStatus(status).replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

export function safeArray(value: unknown) {
  return Array.isArray(value) ? value.map((item) => String(item).trim()).filter(Boolean).slice(0, 40) : [];
}

export function textOrFallback(value: unknown, fallback = "Not available yet") {
  const text = String(value ?? "").trim();
  return text || fallback;
}

export function formatDateRange(start?: unknown, end?: unknown) {
  const s = String(start ?? "").trim();
  const e = String(end ?? "").trim();
  if (s && e) return s + " to " + e;
  return s || e || "Dates not set";
}

