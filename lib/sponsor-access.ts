export const sponsorReviewStatuses = [
  "not_submitted",
  "draft",
  "submitted",
  "pending_review",
  "approved",
  "rejected",
  "needs_changes",
  "suspended"
] as const;

export type SponsorReviewStatus = (typeof sponsorReviewStatuses)[number];
export type SponsorSubscriptionStatus = "none" | "incomplete" | "trialing" | "active" | "past_due" | "canceled" | "unpaid";

export type SponsorFeatureKey =
  | "overview"
  | "campaigns"
  | "challenges"
  | "create_campaign"
  | "brand_profile"
  | "placements"
  | "insights"
  | "reports"
  | "billing"
  | "plans"
  | "team"
  | "messages"
  | "settings";

const alwaysAvailable = new Set<SponsorFeatureKey>(["overview", "brand_profile", "plans", "settings"]);

export function normalizeSponsorReviewStatus(value: unknown): SponsorReviewStatus {
  const normalized = String(value ?? "").trim().toLowerCase();
  if (normalized === "not_started" || !normalized) return "not_submitted";
  if (normalized === "under_review") return "pending_review";
  return sponsorReviewStatuses.includes(normalized as SponsorReviewStatus)
    ? normalized as SponsorReviewStatus
    : "not_submitted";
}

export function normalizeSponsorSubscriptionStatus(value: unknown): SponsorSubscriptionStatus {
  const normalized = String(value ?? "").trim().toLowerCase();
  if (normalized === "trial") return "trialing";
  if (normalized === "cancelled") return "canceled";
  return ["none", "incomplete", "trialing", "active", "past_due", "canceled", "unpaid"].includes(normalized)
    ? normalized as SponsorSubscriptionStatus
    : "none";
}

export function hasActiveSponsorSubscription(status: SponsorSubscriptionStatus) {
  return status === "active" || status === "trialing";
}

export function canAccessSponsorFeature(status: SponsorReviewStatus, feature: SponsorFeatureKey, subscriptionStatus: SponsorSubscriptionStatus = "none") {
  if (status === "suspended") return feature === "messages" || feature === "settings";
  if (alwaysAvailable.has(feature)) return true;
  if (feature === "billing") return status === "approved" || hasActiveSponsorSubscription(subscriptionStatus);
  return status === "approved" && hasActiveSponsorSubscription(subscriptionStatus);
}

export function sponsorStatusLabel(status: SponsorReviewStatus) {
  return status.replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

export function sponsorGateCopy(status: SponsorReviewStatus, subscriptionStatus: SponsorSubscriptionStatus, featureLabel: string) {
  if (status !== "approved" && hasActiveSponsorSubscription(subscriptionStatus) && status !== "suspended") {
    return {
      title: `${featureLabel} are waiting for brand approval`,
      description: "Your sponsor plan is active, but your brand must be approved before this feature unlocks.",
      primaryActionLabel: "View Review Status",
      primaryActionHref: "/sponsor/onboarding"
    };
  }
  if (status === "submitted" || status === "pending_review") {
    return {
      title: `${featureLabel} are waiting for approval`,
      description: "Your sponsor profile has been submitted. This feature unlocks after platform approval.",
      primaryActionLabel: "View Brand Profile",
      primaryActionHref: "/sponsor/onboarding"
    };
  }
  if (status === "rejected" || status === "needs_changes") {
    return {
      title: `${featureLabel} need sponsor approval`,
      description: "Your sponsor profile needs changes before approval. Update the profile, review any available feedback, and submit it again.",
      primaryActionLabel: "Update Brand Profile",
      primaryActionHref: "/sponsor/onboarding"
    };
  }
  if (status === "suspended") {
    return {
      title: "Sponsor access is suspended",
      description: "Your sponsor access is suspended. Contact support before using sponsor tools.",
      primaryActionLabel: "Contact Support",
      primaryActionHref: "/sponsor/messages"
    };
  }
  if (status === "approved" && !hasActiveSponsorSubscription(subscriptionStatus)) {
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
