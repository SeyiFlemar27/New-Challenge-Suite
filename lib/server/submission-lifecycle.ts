export const submissionStatuses = [
  "draft",
  "submitted",
  "pending_review",
  "approved",
  "rejected",
  "flagged",
  "active",
  "eliminated",
  "winner",
  "disqualified",
  "withdrawn"
] as const;

export const participantStatuses = [
  "registered",
  "pending_approval",
  "approved",
  "rejected",
  "active",
  "eliminated",
  "winner",
  "disqualified",
  "withdrawn"
] as const;

export type SubmissionLifecycleStatus = (typeof submissionStatuses)[number];
export type ParticipantLifecycleStatus = (typeof participantStatuses)[number];

const joinableStatuses = new Set(["active", "submission_open"]);
const submittableStatuses = new Set(["active", "submission_open"]);
const closedStatuses = new Set(["draft", "pending_review", "scheduled", "voting_open", "voting_closed", "under_review", "winners_announced", "completed", "cancelled", "paused"]);
const publiclyVotableSubmissionStatuses = new Set<SubmissionLifecycleStatus>(["active", "approved", "winner"]);

function parseDate(value: unknown, endOfDay = true) {
  if (typeof value !== "string" || !value) return null;
  const date = value.includes("T") ? new Date(value) : new Date(`${value}T${endOfDay ? "23:59:59" : "00:00:00"}`);
  return Number.isNaN(date.getTime()) ? null : date;
}

export function isSponsorProfile(profile: Record<string, unknown> = {}) {
  return profile.accountType === "sponsor" || profile.role === "sponsor" || profile.dashboardType === "sponsor_dashboard" || Boolean(profile.isSponsor);
}

export function getSubmissionDeadline(challenge: Record<string, unknown>) {
  return challenge.submissionDeadline ?? challenge.registrationDeadline ?? challenge.endsAt;
}

export function isChallengeJoinable(challenge: Record<string, unknown>, now = new Date()) {
  const status = String(challenge.status ?? "").toLowerCase();
  if (closedStatuses.has(status)) return { allowed: false, reason: `Challenge is ${status.replaceAll("_", " ")}.` };
  if (!joinableStatuses.has(status)) return { allowed: false, reason: "Challenge is not open for entries." };
  const deadline = parseDate(getSubmissionDeadline(challenge));
  if (deadline && now > deadline) return { allowed: false, reason: "Submission deadline has passed." };
  const maxParticipants = Number(challenge.maxParticipants ?? 0);
  const participantCount = Number(challenge.participantCount ?? challenge.participants ?? 0);
  if (maxParticipants > 0 && participantCount >= maxParticipants) return { allowed: false, reason: "Challenge is full." };
  return { allowed: true, reason: null };
}

export function isChallengeSubmittable(challenge: Record<string, unknown>, now = new Date()) {
  const status = String(challenge.status ?? "").toLowerCase();
  if (closedStatuses.has(status)) return { allowed: false, reason: `Challenge is ${status.replaceAll("_", " ")}.` };
  if (!submittableStatuses.has(status)) return { allowed: false, reason: "Challenge is not accepting submissions." };
  const deadline = parseDate(getSubmissionDeadline(challenge));
  if (deadline && now > deadline) return { allowed: false, reason: "Submission deadline has passed." };
  return { allowed: true, reason: null };
}

export function resolveParticipantStatus(challenge: Record<string, unknown>): ParticipantLifecycleStatus {
  if (challenge.requiresParticipantApproval === true || challenge.privateApprovalRequired === true) return "pending_approval";
  return "active";
}

export function resolveSubmissionStatus(challenge: Record<string, unknown>, mediaUploadPending: boolean): SubmissionLifecycleStatus {
  if (mediaUploadPending) return "submitted";
  return challenge.requiresSubmissionApproval === false ? "active" : "pending_review";
}

export function canSubmissionReceiveVotes(status: unknown) {
  return publiclyVotableSubmissionStatuses.has(String(status ?? "") as SubmissionLifecycleStatus);
}

export function normalizeParticipantStatus(status: unknown): ParticipantLifecycleStatus {
  const value = String(status ?? "");
  if (participantStatuses.includes(value as ParticipantLifecycleStatus)) return value as ParticipantLifecycleStatus;
  if (value === "joined") return "registered";
  return "registered";
}
