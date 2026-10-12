import { getChallengePhaseSummary } from "@/lib/challenge-status";

const COMMENT_ACCESS_STATUSES = new Set(["active", "approved"]);

export function isVisibleChallengeCommentStatus(value: unknown) {
  return COMMENT_ACCESS_STATUSES.has(String(value ?? "").toLowerCase());
}

export function canCreateChallengeComment(challenge: Record<string, unknown>, now = new Date()) {
  const phase = getChallengePhaseSummary(challenge, now).phase;
  const persisted = String(challenge.status ?? challenge.lifecycleStatus ?? "").toLowerCase();
  return !["completed", "cancelled", "paused", "postponed"].includes(phase)
    && !["completed", "cancelled", "canceled", "paused", "postponed"].includes(persisted);
}
