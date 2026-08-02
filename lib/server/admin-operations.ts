import { createHash } from "node:crypto";

export const ACTION_TASK_STATES = ["unassigned", "assigned", "in_progress", "waiting_for_user", "waiting_for_provider", "overdue", "escalated", "resolved", "dismissed", "failed_automation"] as const;
export type ActionTaskState = (typeof ACTION_TASK_STATES)[number];

export const SLA_HOURS: Record<string, number> = {
  critical_safety_report: 0, failed_payout: 0, withdrawal_review: 24, first_withdrawal_review: 24,
  challenge_review: 24, sponsor_application: 48, host_verification: 48, support_ticket: 24,
  dispute: 24, appeal: 24, submission_review: 24, winner_confirmation: 24,
  failed_lifecycle_transition: 0, critical_provider_failure: 0, refund_review: 24, chargeback: 0
};

export function operationalTaskId(sourceType: string, sourceId: string, event = "review") {
  return `task_${createHash("sha256").update(`${sourceType}:${sourceId}:${event}`).digest("hex").slice(0, 32)}`;
}

export function taskDeadline(sourceType: string, createdAt: unknown) {
  const start = Date.parse(String(createdAt ?? ""));
  const hours = SLA_HOURS[sourceType] ?? 24;
  return new Date((Number.isFinite(start) ? start : Date.now()) + hours * 3600000).toISOString();
}

export function effectiveTaskState(task: Record<string, unknown>, now = Date.now()): ActionTaskState {
  const state = String(task.state ?? "unassigned") as ActionTaskState;
  if (["resolved", "dismissed", "escalated", "failed_automation"].includes(state)) return state;
  const deadline = Date.parse(String(task.slaDueAt ?? ""));
  return Number.isFinite(deadline) && now > deadline ? "overdue" : state;
}

export const SAFETY_IMMEDIATE_CATEGORIES = ["threat", "harassment", "identity_fraud", "payment_fraud", "child_safety", "dangerous_content", "impersonation", "extortion"];

export function safetyTriage(category: string) {
  return SAFETY_IMMEDIATE_CATEGORIES.includes(category) ? { priority: "critical", immediateEscalationRequired: true } : { priority: "normal", immediateEscalationRequired: false };
}

export function appealDeadline(decisionAt: string) {
  return new Date(Date.parse(decisionAt) + 72 * 3600000).toISOString();
}

export const READINESS_STATES = ["not_configured", "configuration_in_progress", "ready_for_testing", "testing", "ready_to_launch", "live", "temporarily_paused", "retired"] as const;
export const SYSTEM_STATUS_LABELS = ["working_normally", "delayed", "needs_attention", "not_connected", "temporarily_unavailable", "paused"] as const;

export function providerConfigurationStatus() {
  return {
    payments: Boolean(process.env.STRIPE_SECRET_KEY),
    uploads: Boolean(process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET || process.env.FIREBASE_STORAGE_BUCKET),
    authentication: Boolean(process.env.FIREBASE_PROJECT_ID || process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID),
    email: Boolean(process.env.RESEND_API_KEY),
    identityVerification: Boolean(process.env.SUMSUB_APP_TOKEN),
    refundProvider: Boolean(process.env.STRIPE_SECRET_KEY),
    chargebackProvider: Boolean(process.env.STRIPE_SECRET_KEY)
  };
}
