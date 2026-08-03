export const proposalStatuses = ["draft", "sent", "viewed", "received", "under_review", "negotiating", "changes_requested", "accepted", "declined", "admin_review", "funding_required", "funded", "live", "completed", "cancelled", "expired", "withdrawn", "converted_to_campaign", "archived"] as const;
export const proposalRevisionStatuses = ["proposed", "countered", "changes_requested", "accepted", "declined", "withdrawn"] as const;
export const deliverableStatuses = ["not_started", "pending", "in_progress", "active", "submitted", "under_review", "changes_requested", "approved", "completed", "blocked", "overdue", "cancelled"] as const;
export const approvalStatuses = ["pending", "under_review", "approved", "changes_requested", "rejected", "overdue", "cancelled"] as const;
export const messageStatuses = ["draft", "sent", "delivered_foundation", "read_foundation", "failed"] as const;
export type ProposalStatus = typeof proposalStatuses[number];
export type ProposalRevisionStatus = typeof proposalRevisionStatuses[number];
export type DeliverableStatus = typeof deliverableStatuses[number];
export type ApprovalStatus = typeof approvalStatuses[number];
export type MessageStatus = typeof messageStatuses[number];
export function label(value: unknown, fallback = "Not available yet") { const text = String(value ?? "").trim(); if (!text) return fallback; return text.replaceAll("_", " ").replace(/\b\w/g, (match) => match.toUpperCase()); }
export function normalizeProposalStatus(value: unknown): ProposalStatus { return proposalStatuses.includes(value as ProposalStatus) ? value as ProposalStatus : "draft"; }
export function normalizeRevisionStatus(value: unknown): ProposalRevisionStatus { return proposalRevisionStatuses.includes(value as ProposalRevisionStatus) ? value as ProposalRevisionStatus : "proposed"; }
export function normalizeDeliverableStatus(value: unknown): DeliverableStatus { return deliverableStatuses.includes(value as DeliverableStatus) ? value as DeliverableStatus : "not_started"; }
export function normalizeApprovalStatus(value: unknown): ApprovalStatus { return approvalStatuses.includes(value as ApprovalStatus) ? value as ApprovalStatus : "pending"; }
export function cleanText(value: unknown, fallback = "") { return String(value ?? fallback).trim().slice(0, 2400); }
export function safeArray(value: unknown) { if (Array.isArray(value)) return value.map((item) => cleanText(item).slice(0, 180)).filter(Boolean).slice(0, 30); if (typeof value === "string") return value.split(",").map((item) => item.trim()).filter(Boolean).slice(0, 30); return []; }
export function normalizeProposalDeliverables(value: unknown) {
  if (!Array.isArray(value)) return typeof value === "string" ? safeArray(value).map((title, index) => ({ id: `deliverable_${index + 1}`, title, description: "", dueDate: "", required: true, attachment: null })) : [];
  return value.slice(0, 20).flatMap((item, index) => {
    if (typeof item === "string") return item.trim() ? [{ id: `deliverable_${index + 1}`, title: cleanText(item).slice(0, 180), description: "", dueDate: "", required: true, attachment: null }] : [];
    if (!item || typeof item !== "object") return [];
    const record = item as Record<string, unknown>;
    const title = cleanText(record.title ?? record.name).slice(0, 180);
    if (!title) return [];
    const attachmentRecord = record.attachment && typeof record.attachment === "object" ? record.attachment as Record<string, unknown> : null;
    const attachment = attachmentRecord && cleanText(attachmentRecord.url).startsWith("https://") && cleanText(attachmentRecord.path)
      ? { url: cleanText(attachmentRecord.url).slice(0, 800), path: cleanText(attachmentRecord.path).slice(0, 500), fileName: cleanText(attachmentRecord.fileName).slice(0, 180) || null, contentType: cleanText(attachmentRecord.contentType).slice(0, 120) || null }
      : null;
    return [{ id: cleanText(record.id, `deliverable_${index + 1}`).slice(0, 80), title, description: cleanText(record.description).slice(0, 800), dueDate: cleanText(record.dueDate).slice(0, 40), required: record.required !== false, attachment }];
  });
}
export function cleanMoneyCents(value: unknown) { const numeric = Number(value ?? 0); return Number.isFinite(numeric) && numeric >= 0 ? Math.round(numeric * 100) : 0; }
export function isoNow() { return new Date().toISOString(); }
