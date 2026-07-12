export const contractStatuses = ["draft", "sent_for_review", "changes_requested", "awaiting_signature", "partially_signed", "fully_signed", "active", "completed", "cancelled", "disputed", "archived"] as const;
export const milestoneStatuses = ["draft", "scheduled", "awaiting_funding", "funded", "in_progress", "submitted", "under_review", "approved", "release_pending", "released_foundation", "disputed", "cancelled"] as const;
export const invoiceTypes = ["subscription_invoice", "campaign_invoice", "funding_receipt", "milestone_receipt", "refund_receipt", "adjustment_note"] as const;
export const invoiceStatuses = ["draft", "issued", "paid", "payment_pending", "failed", "refunded", "cancelled", "void"] as const;
export const transactionTypes = ["wallet_topup", "campaign_funding", "fund_reservation", "milestone_release", "refund", "adjustment", "platform_fee", "failed_payment"] as const;
export const transactionStatuses = ["pending", "processing", "completed", "failed", "cancelled", "refunded", "disputed", "reversed"] as const;

export type ContractStatus = typeof contractStatuses[number];
export type MilestoneStatus = typeof milestoneStatuses[number];
export type InvoiceType = typeof invoiceTypes[number];
export type InvoiceStatus = typeof invoiceStatuses[number];
export type SponsorTransactionType = typeof transactionTypes[number];
export type SponsorTransactionStatus = typeof transactionStatuses[number];

export function label(value: unknown, fallback = "Not available yet") {
  const text = String(value ?? "").trim();
  if (!text) return fallback;
  return text.replaceAll("_", " ").replace(/\b\w/g, (match) => match.toUpperCase());
}

export function cleanText(value: unknown, fallback = "") {
  return String(value ?? fallback).trim().slice(0, 2400);
}

export function safeArray(value: unknown) {
  if (Array.isArray(value)) return value.map((item) => cleanText(item).slice(0, 180)).filter(Boolean).slice(0, 30);
  if (typeof value === "string") return value.split(",").map((item) => item.trim()).filter(Boolean).slice(0, 30);
  return [];
}

export function cleanMoneyCents(value: unknown) {
  const numeric = Number(value ?? 0);
  return Number.isFinite(numeric) && numeric >= 0 ? Math.round(numeric * 100) : 0;
}

export function formatMoney(cents: unknown, currency = "USD") {
  const amount = Number(cents ?? 0) / 100;
  return `${currency} ${amount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export function isoNow() { return new Date().toISOString(); }
export function normalizeContractStatus(value: unknown): ContractStatus { return contractStatuses.includes(value as ContractStatus) ? value as ContractStatus : "draft"; }
export function normalizeMilestoneStatus(value: unknown): MilestoneStatus { return milestoneStatuses.includes(value as MilestoneStatus) ? value as MilestoneStatus : "draft"; }
export function normalizeInvoiceType(value: unknown): InvoiceType { return invoiceTypes.includes(value as InvoiceType) ? value as InvoiceType : "campaign_invoice"; }
export function normalizeInvoiceStatus(value: unknown): InvoiceStatus { return invoiceStatuses.includes(value as InvoiceStatus) ? value as InvoiceStatus : "draft"; }
export function normalizeTransactionType(value: unknown): SponsorTransactionType { return transactionTypes.includes(value as SponsorTransactionType) ? value as SponsorTransactionType : "campaign_funding"; }
export function normalizeTransactionStatus(value: unknown): SponsorTransactionStatus { return transactionStatuses.includes(value as SponsorTransactionStatus) ? value as SponsorTransactionStatus : "pending"; }

export const legalDisclaimer = "Challenge Suite does not provide legal advice. Contract templates and workflow tools are provided for operational convenience only. Sponsors and creators should consult qualified legal professionals before signing agreements.";
export const campaignFundingDisclaimer = "Campaign sponsorship funds are separate from Sponsor subscriptions. Funds are reserved for campaign activity and are not released until contract, milestone, verification, and server-side payment requirements are met.";

export const contractTemplates = [
  { id: "standard_sponsorship", name: "Standard Sponsorship Agreement", intendedUse: "General creator or challenge sponsorship", sections: ["Parties", "Deliverables", "Payment terms foundation", "Usage rights", "Cancellation", "Disputes"], legalReviewRecommended: true },
  { id: "creator_collaboration", name: "Creator Collaboration Agreement", intendedUse: "Creator-led campaign collaboration", sections: ["Scope", "Creator duties", "Approval workflow", "Content usage", "Confidentiality"], legalReviewRecommended: true },
  { id: "challenge_sponsorship", name: "Challenge Sponsorship Agreement", intendedUse: "Brand placement on a Challenge Suite challenge", sections: ["Placement", "Campaign timeline", "Brand safety", "Deliverables", "Reporting foundation"], legalReviewRecommended: true },
  { id: "event_sponsorship", name: "Event Sponsorship Agreement", intendedUse: "Live, hybrid, or tournament sponsorship", sections: ["Event details", "Venue/live obligations", "Brand placements", "Milestones", "Cancellation"], legalReviewRecommended: true },
  { id: "deliverables", name: "Deliverables Agreement", intendedUse: "Specific asset or milestone delivery", sections: ["Deliverables", "Revisions", "Approval criteria", "Timeline", "Usage rights"], legalReviewRecommended: true },
  { id: "enterprise_custom", name: "Custom Enterprise Template", intendedUse: "Enterprise legal team workflow foundation", sections: ["Custom terms", "Approval chains", "Audit trail", "Service levels", "Compliance"], legalReviewRecommended: true }
];
