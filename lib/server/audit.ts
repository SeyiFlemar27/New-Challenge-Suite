import { getAdminDb } from "@/lib/firebase/admin";
import type { Firestore } from "firebase-admin/firestore";

export type AuditActorType = "user" | "creator" | "sponsor" | "admin" | "system";

export type AuditAction =
  | "account.updated"
  | "plan.changed"
  | "sponsor.onboarding_updated"
  | "challenge.created"
  | "challenge.updated"
  | "submission.approved"
  | "submission.rejected"
  | "vote.recorded"
  | "leaderboard.locked"
  | "winner.selected"
  | "winner.reviewed"
  | "prize_pool.status_changed"
  | "payout.status_changed"
  | "refund.status_changed"
  | "dispute.status_changed"
  | "report.status_changed"
  | "verification.status_changed"
  | "kyc.status_changed";

export type AuditTargetType =
  | "account"
  | "plan"
  | "sponsorProfile"
  | "challenge"
  | "submission"
  | "vote"
  | "leaderboard"
  | "winner"
  | "prizePool"
  | "payout"
  | "refund"
  | "dispute"
  | "report"
  | "verification"
  | "kyc"
  | "system";

export interface AuditLogInput {
  actorId: string;
  actorType: AuditActorType;
  action: AuditAction | string;
  targetType: AuditTargetType | string;
  targetId: string;
  before?: unknown;
  after?: unknown;
  reason?: string | null;
  metadata?: Record<string, unknown>;
  createdAt?: string;
}

export interface AuditLogRecord extends AuditLogInput {
  id: string;
  createdAt: string;
}

function removeUndefined(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(removeUndefined);
  if (value === null || typeof value !== "object") return value;
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>)
      .filter(([, entry]) => entry !== undefined)
      .map(([key, entry]) => [key, removeUndefined(entry)])
  );
}

export function createAuditLogRecord(input: AuditLogInput, id: string, createdAt = input.createdAt ?? new Date().toISOString()): AuditLogRecord {
  return {
    id,
    actorId: input.actorId,
    actorType: input.actorType,
    action: input.action,
    targetType: input.targetType,
    targetId: input.targetId,
    before: removeUndefined(input.before),
    after: removeUndefined(input.after),
    reason: input.reason ?? null,
    metadata: removeUndefined(input.metadata ?? {}) as Record<string, unknown>,
    createdAt
  };
}

export async function writeAuditLog(input: AuditLogInput, db: Firestore | null = getAdminDb()) {
  if (!db) {
    console.warn("[audit] skipped because Firebase Admin is not configured", {
      action: input.action,
      targetType: input.targetType,
      targetId: input.targetId
    });
    return null;
  }

  const ref = db.collection("auditLogs").doc();
  const record = createAuditLogRecord(input, ref.id);

  await ref.set(record);
  return record;
}

export function auditMetadata(input: Record<string, unknown> = {}) {
  return removeUndefined(input) as Record<string, unknown>;
}
