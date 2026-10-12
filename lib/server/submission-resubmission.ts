export const SUBMISSION_RESUBMISSION_WINDOW_MS = 24 * 60 * 60 * 1000;

function challengeDeadline(challenge: Record<string, unknown>) {
  const configured = [
    challenge.submissionDeadline,
    challenge.submissionEndAt,
    challenge.submissionClosesAt,
    challenge.submissionsCloseAt,
    challenge.submissionEndDate
  ].filter((value) => value != null && value !== "");
  if (configured.length) {
    const parsed = configured.map(timestamp);
    return parsed.some((value) => !Number.isFinite(value)) ? Number.NaN : Math.min(...parsed);
  }
  const uploads = challenge.timeLimitedUploads && typeof challenge.timeLimitedUploads === "object"
    ? (challenge.timeLimitedUploads as Record<string, unknown>).endsAt
    : null;
  return uploads ?? challenge.challengeEndsAt ?? challenge.endsAt ?? Number.POSITIVE_INFINITY;
}

function timestamp(value: unknown) {
  if (value instanceof Date) return value.getTime();
  if (typeof value === "number") return Number.isFinite(value) ? value : Number.NaN;
  if (typeof value === "string") return Date.parse(value);
  if (value && typeof value === "object" && "toDate" in value && typeof value.toDate === "function") {
    const date = value.toDate();
    return date instanceof Date ? date.getTime() : Number.NaN;
  }
  return Number.NaN;
}

export function resolveResubmissionDeadline(input: {
  requestedDeadline: unknown;
  challenge: Record<string, unknown>;
  now?: Date;
}) {
  const nowMs = (input.now ?? new Date()).getTime();
  const requestedMs = timestamp(input.requestedDeadline);
  if (!Number.isFinite(nowMs) || !Number.isFinite(requestedMs) || requestedMs <= nowMs) {
    return { allowed: false as const, deadline: null, reason: "invalid_or_expired_request" as const };
  }

  const challengeDeadlineValue = challengeDeadline(input.challenge);
  const challengeDeadlineMs = challengeDeadlineValue === Number.POSITIVE_INFINITY ? Number.POSITIVE_INFINITY : timestamp(challengeDeadlineValue);
  if (!Number.isFinite(challengeDeadlineMs) && challengeDeadlineMs !== Number.POSITIVE_INFINITY) {
    return { allowed: false as const, deadline: null, reason: "invalid_challenge_deadline" as const };
  }
  const deadlineMs = Math.min(
    requestedMs,
    nowMs + SUBMISSION_RESUBMISSION_WINDOW_MS,
    Number.isFinite(challengeDeadlineMs) ? challengeDeadlineMs : Number.POSITIVE_INFINITY
  );
  if (deadlineMs <= nowMs) return { allowed: false as const, deadline: null, reason: "challenge_deadline_passed" as const };
  return { allowed: true as const, deadline: new Date(deadlineMs).toISOString(), reason: null };
}

export function resubmissionWindowOpen(input: {
  submission: Record<string, unknown>;
  challenge: Record<string, unknown>;
  now?: Date;
}) {
  if (String(input.submission.status ?? "").toLowerCase() !== "resubmission_requested") return false;
  const requestId = typeof input.submission.resubmissionRequestId === "string" ? input.submission.resubmissionRequestId : "";
  if (requestId && input.submission.resubmissionCompletedRequestId === requestId) return false;
  const nowMs = (input.now ?? new Date()).getTime();
  const correctionDeadlineMs = timestamp(input.submission.resubmissionDeadline);
  const challengeDeadlineValue = challengeDeadline(input.challenge);
  const challengeDeadlineMs = challengeDeadlineValue === Number.POSITIVE_INFINITY ? Number.POSITIVE_INFINITY : timestamp(challengeDeadlineValue);
  return Number.isFinite(nowMs)
    && Number.isFinite(correctionDeadlineMs)
    && (Number.isFinite(challengeDeadlineMs) || challengeDeadlineMs === Number.POSITIVE_INFINITY)
    && nowMs < correctionDeadlineMs
    && nowMs < challengeDeadlineMs;
}
