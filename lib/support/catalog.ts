export const SUPPORT_CATEGORIES = {
  account_security: {
    label: "Account & Security",
    issueTypes: ["login", "recovery", "verification", "access_restriction", "suspicious_activity"]
  },
  challenges_participation: {
    label: "Challenges & Participation",
    issueTypes: ["joining", "submission", "eligibility", "disqualification", "cancellation"]
  },
  tournaments_competitions: {
    label: "Tournaments & Competitions",
    issueTypes: ["team_registration", "bracket", "match_submission", "advancement", "results"]
  },
  payments_billing: {
    label: "Payments & Billing",
    issueTypes: ["failed_payment", "duplicate_charge", "refund", "subscription", "invoice"]
  },
  wallet_dorocoins: {
    label: "Wallet & DoroCoins",
    issueTypes: ["missing_dorocoins", "purchase", "balance", "ledger_event"]
  },
  withdrawals_earnings: {
    label: "Withdrawals & Earnings",
    issueTypes: ["pending_withdrawal", "failed_payout", "kyc", "earnings", "payout_destination"]
  },
  sponsorships_workspaces: {
    label: "Sponsorships & Workspaces",
    issueTypes: ["campaign", "placement", "sponsor_payment", "enterprise_access"]
  },
  safety_reporting: {
    label: "Safety & Reporting",
    issueTypes: ["abuse", "harassment", "fraud", "impersonation", "inappropriate_content"]
  },
  technical_issues: {
    label: "Technical Issues",
    issueTypes: ["site_error", "upload", "broken_experience", "performance", "notification"]
  },
  other: { label: "Other", issueTypes: ["other"] }
} as const;

export type SupportCategory = keyof typeof SUPPORT_CATEGORIES;
export type SupportIssueType = (typeof SUPPORT_CATEGORIES)[SupportCategory]["issueTypes"][number];
export type SupportTicketStatus = "open" | "in_review" | "waiting_for_you" | "resolved" | "closed";
export type SupportIssueCondition = "investigating" | "awaiting_customer" | "pending_provider" | "awaiting_remediation" | "fixed" | "explained";

export const SUPPORT_TICKET_STATUSES: readonly SupportTicketStatus[] = ["open", "in_review", "waiting_for_you", "resolved", "closed"];
export const SUPPORT_ISSUE_CONDITIONS: readonly SupportIssueCondition[] = ["investigating", "awaiting_customer", "pending_provider", "awaiting_remediation", "fixed", "explained"];

export const SUPPORT_ISSUE_TYPE_LABELS: Record<string, string> = Object.fromEntries(
  Object.values(SUPPORT_CATEGORIES).flatMap(({ issueTypes }) => issueTypes.map((value) => [value, value.replaceAll("_", " ")]))
);

export function isSupportCategory(value: unknown): value is SupportCategory {
  return typeof value === "string" && Object.hasOwn(SUPPORT_CATEGORIES, value);
}

export function supportIssueTypeAllowed(category: unknown, issueType: unknown): boolean {
  if (!isSupportCategory(category) || typeof issueType !== "string") return false;
  return (SUPPORT_CATEGORIES[category].issueTypes as readonly string[]).includes(issueType);
}

export function normalizeSupportTicketStatus(value: unknown): SupportTicketStatus {
  if (SUPPORT_TICKET_STATUSES.includes(value as SupportTicketStatus)) return value as SupportTicketStatus;
  if (value === "waiting_for_user") return "waiting_for_you";
  if (value === "waiting_for_admin" || value === "reopened" || value === "submitted" || value === "new") return "open";
  if (["under_review", "in_progress", "waiting_for_provider", "escalated", "assigned"].includes(String(value))) return "in_review";
  if (value === "closed") return "closed";
  if (value === "resolved") return "resolved";
  return "open";
}

export function isFinalSupportIssueCondition(value: unknown): value is "fixed" | "explained" {
  return value === "fixed" || value === "explained";
}
