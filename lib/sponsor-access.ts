export const sponsorReviewStatuses = [
  "not_submitted",
  "draft",
  "in_progress",
  "submitted",
  "pending_review",
  "under_review",
  "additional_information_required",
  "approved",
  "verified",
  "rejected",
  "needs_changes",
  "flagged",
  "suspended"
] as const;

export type SponsorReviewStatus = (typeof sponsorReviewStatuses)[number];
export type SponsorSubscriptionStatus = "none" | "incomplete" | "trialing" | "active" | "payment_warning_1" | "payment_warning_2" | "past_due" | "canceled" | "unpaid";

export type SponsorFeatureKey =
  | "overview"
  | "campaigns"
  | "discover"
  | "proposals"
  | "messages"
  | "approvals"
  | "deliverables"
  | "contracts"
  | "wallet"
  | "analytics"
  | "reports"
  | "brand_assets"
  | "team"
  | "notifications"
  | "settings"
  | "challenges"
  | "create_campaign"
  | "brand_profile"
  | "placements"
  | "insights"
  | "billing"
  | "plans";

const alwaysAvailable = new Set<SponsorFeatureKey>(["overview", "brand_profile", "plans", "settings", "notifications", "messages"]);
const setupAvailable = new Set<SponsorFeatureKey>(["discover", "proposals", "brand_assets", "approvals", "deliverables", "contracts", "analytics", "reports", "wallet"]);

export function normalizeSponsorReviewStatus(value: unknown): SponsorReviewStatus {
  const normalized = String(value ?? "").trim().toLowerCase();
  if (normalized === "not_started" || !normalized) return "not_submitted";
  if (normalized === "under_review") return "pending_review";
  if (normalized === "additional_info_required") return "additional_information_required";
  return sponsorReviewStatuses.includes(normalized as SponsorReviewStatus)
    ? normalized as SponsorReviewStatus
    : "not_submitted";
}

export function normalizeSponsorSubscriptionStatus(value: unknown): SponsorSubscriptionStatus {
  const normalized = String(value ?? "").trim().toLowerCase();
  if (normalized === "trial") return "trialing";
  if (normalized === "cancelled") return "canceled";
  return ["none", "incomplete", "trialing", "active", "payment_warning_1", "payment_warning_2", "past_due", "canceled", "unpaid"].includes(normalized)
    ? normalized as SponsorSubscriptionStatus
    : "none";
}

export function hasActiveSponsorSubscription(status: SponsorSubscriptionStatus) {
  return ["active", "trialing", "payment_warning_1", "payment_warning_2"].includes(status);
}

export function sponsorIsApproved(status: SponsorReviewStatus) {
  return status === "approved" || status === "verified";
}

export function canAccessSponsorFeature(status: SponsorReviewStatus, feature: SponsorFeatureKey, subscriptionStatus: SponsorSubscriptionStatus = "none") {
  if (status === "suspended" || status === "flagged") return feature === "messages" || feature === "settings" || feature === "notifications";
  if (alwaysAvailable.has(feature)) return true;
  if (feature === "billing" || feature === "wallet") return sponsorIsApproved(status) || hasActiveSponsorSubscription(subscriptionStatus);
  if (setupAvailable.has(feature)) return status !== "rejected" && status !== "needs_changes";
  return sponsorIsApproved(status) && hasActiveSponsorSubscription(subscriptionStatus);
}

export function sponsorStatusLabel(status: SponsorReviewStatus) {
  return status.replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

export function sponsorGateCopy(status: SponsorReviewStatus, subscriptionStatus: SponsorSubscriptionStatus, featureLabel: string) {
  if (!sponsorIsApproved(status) && hasActiveSponsorSubscription(subscriptionStatus) && status !== "suspended" && status !== "flagged") {
    return {
      title: `${featureLabel} are waiting for brand approval`,
      description: "Your sponsor plan is active, but your brand must be approved before this feature unlocks.",
      primaryActionLabel: "View Review Status",
      primaryActionHref: "/sponsor/onboarding"
    };
  }
  if (status === "submitted" || status === "pending_review" || status === "under_review") {
    return {
      title: `${featureLabel} are waiting for approval`,
      description: "Your sponsor profile has been submitted. This feature unlocks after platform approval.",
      primaryActionLabel: "View Brand Profile",
      primaryActionHref: "/sponsor/onboarding"
    };
  }
  if (status === "rejected" || status === "needs_changes" || status === "additional_information_required") {
    return {
      title: `${featureLabel} need sponsor approval`,
      description: "Your sponsor profile needs changes before approval. Update the profile, review any available feedback, and submit it again.",
      primaryActionLabel: "Update Brand Profile",
      primaryActionHref: "/sponsor/onboarding"
    };
  }
  if (status === "suspended" || status === "flagged") {
    return {
      title: "Sponsor access is restricted",
      description: "Your sponsor access is restricted. Contact support before using sponsor tools.",
      primaryActionLabel: "Contact Support",
      primaryActionHref: "/sponsor/messages"
    };
  }
  if (sponsorIsApproved(status) && !hasActiveSponsorSubscription(subscriptionStatus)) {
    return {
      title: `${featureLabel} require a sponsor plan`,
      description: "Your brand is approved. Choose and activate a sponsor subscription to unlock this feature.",
      primaryActionLabel: "Choose Sponsor Plan",
      primaryActionHref: "/sponsor/plans"
    };
  }
  return {
    title: `${featureLabel} are locked`,
    description: "Complete and submit your brand profile for review before using this feature.",
    primaryActionLabel: "Complete Brand Profile",
    primaryActionHref: "/sponsor/onboarding"
  };
}