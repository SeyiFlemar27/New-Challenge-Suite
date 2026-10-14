export const NORMAL_REVIEW_ESCALATION_MS = 24 * 60 * 60_000;
export const NORMAL_APPEAL_WINDOW_MS = 24 * 60 * 60_000;
export const NORMAL_CORRECTION_REVIEW_MS = 5 * 60_000;
export function normalTimestamp(value: unknown) {
  if (value instanceof Date) return value.getTime();
  if (value && typeof value === "object" && "toDate" in value && typeof value.toDate === "function") return value.toDate().getTime();
  return Date.parse(String(value ?? ""));
}
export function normalModerationPending(submission: Record<string, unknown>, now: Date) {
  const status = String(submission.status ?? "");
  if (["submitted", "pending_review", "flagged", "resubmission_requested"].includes(status)) return true;
  if (["submitted", "under_review"].includes(String(submission.appealStatus ?? ""))) return true;
  return status === "rejected" && normalTimestamp(submission.appealDeadline) > now.getTime();
}
export function normalVotingSchedule(challenge: Record<string, unknown>, now: Date) {
  const start = normalTimestamp(challenge.configuredVotingStartsAt ?? challenge.votingStartsAt);
  const end = normalTimestamp(challenge.configuredVotingEndsAt ?? challenge.votingDeadline ?? challenge.votingEndsAt);
  if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start || now.getTime() < start) return null;
  return { configuredVotingStartsAt: new Date(start).toISOString(), configuredVotingEndsAt: new Date(end).toISOString(), effectiveVotingStartsAt: now.toISOString(), effectiveVotingEndsAt: new Date(now.getTime() + end - start).toISOString(), votingDurationMs: end - start };
}
