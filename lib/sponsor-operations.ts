export const analyticsDataLabels = ["verified", "estimated", "externally_tracked", "manually_entered", "foundation_unavailable"] as const;
export const reportStatuses = ["draft", "generating", "ready", "failed", "expired", "unavailable"] as const;
export const reportTypes = ["campaign_performance", "financial", "creator_performance", "deliverables", "audience", "campaign_completion", "invoice_summary", "team_activity"] as const;
export const assetTypes = ["logo", "campaign_banner", "product_image", "video", "font", "brand_guideline", "hashtag_list", "legal_disclaimer", "campaign_template", "promotional_document"] as const;
export const teamRoles = ["owner", "admin", "campaign_manager", "marketing_manager", "finance", "legal", "analyst", "viewer"] as const;
export const teamStatuses = ["active", "invited", "pending", "suspended", "removed"] as const;
export const notificationCategories = ["new_proposal", "proposal_response", "message_received", "contract_update", "signature_required", "payment_required", "milestone_completed", "deliverable_submitted", "approval_requested", "campaign_launched", "campaign_ending", "winner_announced", "report_generated", "verification_update", "subscription_renewal", "failed_payment"] as const;
export const notificationChannels = ["in_app", "email", "sms_foundation", "webhook_foundation"] as const;

export type AnalyticsDataLabel = typeof analyticsDataLabels[number];
export type ReportStatus = typeof reportStatuses[number];
export type ReportType = typeof reportTypes[number];
export type AssetType = typeof assetTypes[number];
export type TeamRole = typeof teamRoles[number];
export type TeamStatus = typeof teamStatuses[number];

export function label(value: unknown, fallback = "Not available yet") {
  const text = String(value ?? "").trim();
  if (!text) return fallback;
  return text.replaceAll("_", " ").replace(/\b\w/g, (match) => match.toUpperCase());
}

export function cleanText(value: unknown, fallback = "") {
  return String(value ?? fallback).trim().slice(0, 2400);
}

export function safeArray(value: unknown) {
  if (Array.isArray(value)) return value.map((item) => cleanText(item).slice(0, 180)).filter(Boolean).slice(0, 40);
  if (typeof value === "string") return value.split(",").map((item) => item.trim()).filter(Boolean).slice(0, 40);
  return [];
}

export function normalizeReportStatus(value: unknown): ReportStatus { return reportStatuses.includes(value as ReportStatus) ? value as ReportStatus : "draft"; }
export function normalizeReportType(value: unknown): ReportType { return reportTypes.includes(value as ReportType) ? value as ReportType : "campaign_performance"; }
export function normalizeAssetType(value: unknown): AssetType { return assetTypes.includes(value as AssetType) ? value as AssetType : "logo"; }
export function normalizeTeamRole(value: unknown): TeamRole { return teamRoles.includes(value as TeamRole) ? value as TeamRole : "viewer"; }
export function normalizeTeamStatus(value: unknown): TeamStatus { return teamStatuses.includes(value as TeamStatus) ? value as TeamStatus : "pending"; }
export function isoNow() { return new Date().toISOString(); }

export function defaultAnalyticsSummary() {
  return {
    dataQuality: "foundation_unavailable" as AnalyticsDataLabel,
    message: "No verified analytics yet. Analytics will appear after sponsored campaigns generate verified activity.",
    campaignMetrics: ["total_impressions", "unique_views", "challenge_page_visits", "cta_clicks", "click_through_rate", "participants", "submissions", "votes", "engagement_rate", "conversion_rate", "cost_per_click", "cost_per_participant", "cost_per_vote", "campaign_spend", "budget_utilization"],
    breakdowns: ["geographic_breakdown", "device_breakdown", "traffic_source", "audience_demographics"],
    portfolioMetrics: ["total_campaigns", "total_sponsorship_spend", "average_cost_per_participant", "average_engagement", "top_creators", "top_categories", "best_locations", "campaign_comparison", "month_over_month_performance"]
  };
}

export function defaultNotificationPreferences() {
  return Object.fromEntries(notificationCategories.map((category) => [category, { in_app: true, email: false, sms_foundation: false, webhook_foundation: false, emailProviderConfigured: false, smsProviderConfigured: false, webhookProviderConfigured: false }]));
}

export function rolePermissions(role: TeamRole) {
  const base = { campaignCreation: false, proposalApproval: false, contractApproval: false, paymentAccess: false, milestoneRelease: false, analyticsAccess: true, teamManagement: false, settingsAccess: false, brandAssetAccess: true };
  if (role === "owner") return { ...base, campaignCreation: true, proposalApproval: true, contractApproval: true, paymentAccess: true, teamManagement: true, settingsAccess: true };
  if (role === "admin") return { ...base, campaignCreation: true, proposalApproval: true, contractApproval: true, paymentAccess: true, teamManagement: true, settingsAccess: true };
  if (role === "campaign_manager") return { ...base, campaignCreation: true, proposalApproval: true, brandAssetAccess: true };
  if (role === "finance") return { ...base, paymentAccess: true, analyticsAccess: true };
  if (role === "legal") return { ...base, contractApproval: true, proposalApproval: true };
  if (role === "analyst") return { ...base, analyticsAccess: true, brandAssetAccess: false };
  return base;
}
