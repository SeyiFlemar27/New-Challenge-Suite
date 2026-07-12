export const proposalStatuses = ["draft", "sent", "received", "under_review", "negotiating", "changes_requested", "accepted", "declined", "expired", "withdrawn", "converted_to_campaign", "archived"] as const;
export const proposalRevisionStatuses = ["proposed", "countered", "changes_requested", "accepted", "declined", "withdrawn"] as const;
export const deliverableStatuses = ["not_started", "in_progress", "submitted", "under_review", "changes_requested", "approved", "overdue", "cancelled"] as const;
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
export function cleanMoneyCents(value: unknown) { const numeric = Number(value ?? 0); return Number.isFinite(numeric) && numeric >= 0 ? Math.round(numeric * 100) : 0; }
export function isoNow() { return new Date().toISOString(); }
