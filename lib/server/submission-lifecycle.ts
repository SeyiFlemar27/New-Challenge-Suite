import { getChallengeLifecycleState } from "@/lib/challenge-status";

export const submissionStatuses = [
  "draft",
  "submitted",
  "pending_review",
  "approved",
  "rejected",
  "flagged",
  "active",
  "incomplete",
  "eliminated",
  "winner",
  "disqualified",
  "withdrawn"
] as const;

export const participantStatuses = [
  "registered",
  "entered",
  "enrolled",
  "pending_approval",
  "approved",
  "rejected",
  "active",
  "incomplete",
  "eliminated",
  "winner",
  "disqualified",
  "withdrawn"
] as const;

export type SubmissionLifecycleStatus = (typeof submissionStatuses)[number];
export type ParticipantLifecycleStatus = (typeof participantStatuses)[number];

const publiclyVotableSubmissionStatuses = new Set<SubmissionLifecycleStatus>(["active", "approved", "winner"]);

export function isSponsorProfile(profile: Record<string, unknown> = {}) {
  return profile.accountType === "sponsor" || profile.role === "sponsor" || profile.dashboardType === "sponsor_dashboard" || Boolean(profile.isSponsor);
}

export function getSubmissionDeadline(challenge: Record<string, unknown>) {
  return challenge.submissionClosesAt ?? challenge.submissionDeadline ?? challenge.registrationDeadline ?? challenge.endsAt;
}

export function isChallengeJoinable(challenge: Record<string, unknown>, now = new Date()) {
  const lifecycle = getChallengeLifecycleState(challenge, now);
  return {
    allowed: lifecycle.canJoin,
    reason: lifecycle.canJoin ? null : lifecycle.disabledReason ?? lifecycle.userFacingMessage ?? "Challenge is not open for entries.",
    code: lifecycle.reasonCode,
    lifecycle
  };
}

export function isChallengeSubmittable(challenge: Record<string, unknown>, now = new Date()) {
  const lifecycle = getChallengeLifecycleState(challenge, now);
  return {
    allowed: lifecycle.canSubmit,
    reason: lifecycle.canSubmit ? null : lifecycle.disabledReason ?? lifecycle.userFacingMessage ?? "Challenge is not accepting submissions.",
    code: lifecycle.reasonCode,
    lifecycle
  };
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
  const value = String(status ?? "").toLowerCase();
  if (participantStatuses.includes(value as ParticipantLifecycleStatus)) return value as ParticipantLifecycleStatus;
  if (value === "joined" || value === "checked_in") return "active";
  return "registered";
}

export function isEnteredParticipantStatus(status: unknown) {
  return ["entered", "enrolled", "approved", "active", "joined", "checked_in", "submitted", "winner"].includes(String(status ?? "").toLowerCase());
}


