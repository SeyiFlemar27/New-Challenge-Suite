export const challengeLifecycleStatuses = [
  "draft",
  "pending_review",
  "scheduled",
  "active",
  "submission_open",
  "voting_open",
  "voting_closed",
  "under_review",
  "winners_announced",
  "completed",
  "cancelled",
  "paused"
] as const;

export type ChallengeLifecycleStatus = (typeof challengeLifecycleStatuses)[number];

export const activeChallengeLimitStatuses: ChallengeLifecycleStatus[] = [
  "pending_review",
  "scheduled",
  "active",
  "submission_open",
  "voting_open",
  "voting_closed",
  "under_review"
];

export const closedChallengeStatuses: ChallengeLifecycleStatus[] = ["completed", "cancelled"];

export interface ChallengeLifecycleInput {
  publish?: boolean;
  startsAt: string;
  endsAt: string;
  submissionDeadline: string;
  votingDeadline: string;
  sponsorEnabled?: boolean;
  visibility?: string;
  competitionFormat?: string;
  premiumOnly?: boolean;
}

export interface DateValidationResult {
  valid: boolean;
  fieldErrors: Record<string, string>;
}

function parseDate(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

export function validateChallengeDates(input: ChallengeLifecycleInput, now = new Date()): DateValidationResult {
  const fieldErrors: Record<string, string> = {};
  const startsAt = parseDate(input.startsAt);
  const endsAt = parseDate(input.endsAt);
  const submissionDeadline = parseDate(input.submissionDeadline);
  const votingDeadline = parseDate(input.votingDeadline);

  if (!startsAt) fieldErrors.startsAt = "Start date is required.";
  if (!endsAt) fieldErrors.endsAt = "End date is required.";
  if (!submissionDeadline) fieldErrors.submissionDeadline = "Submission deadline is required.";
  if (!votingDeadline) fieldErrors.votingDeadline = "Voting deadline is required.";

  if (startsAt && endsAt && startsAt >= endsAt) {
    fieldErrors.startsAt = "Start date must be before end date.";
  }
  if (submissionDeadline && votingDeadline && submissionDeadline > votingDeadline) {
    fieldErrors.submissionDeadline = "Submission deadline must not be after voting deadline.";
  }
  if (votingDeadline && endsAt && votingDeadline > endsAt) {
    fieldErrors.votingDeadline = "Voting deadline must not be after end date.";
  }
  if (votingDeadline && startsAt && votingDeadline <= startsAt) {
    fieldErrors.votingDeadline = "Voting deadline must be after start date.";
  }
  if (input.publish && endsAt && endsAt <= now) {
    fieldErrors.endsAt = "End date must be in the future before publishing or scheduling a challenge.";
  }

  return { valid: Object.keys(fieldErrors).length === 0, fieldErrors };
}

export function normalizeMoneyLockedChallengeFields() {
  return {
    paidEntryEnabled: false,
    entryFee: 0,
    entryFeeCents: 0,
    prizePoolEnabled: false,
    prizePool: 0,
    prizePoolCents: 0,
    cashPayoutsEnabled: false,
    payoutStatus: "not_applicable",
    refundStatus: "not_applicable"
  };
}

export function isAdvancedChallenge(input: Pick<ChallengeLifecycleInput, "sponsorEnabled" | "visibility" | "competitionFormat" | "premiumOnly">) {
  const visibility = String(input.visibility ?? "public").toLowerCase();
  const format = String(input.competitionFormat ?? "Entry Competition").toLowerCase();
  return Boolean(
    input.sponsorEnabled ||
    input.premiumOnly ||
    visibility.includes("private") ||
    visibility.includes("exclusive") ||
    format.includes("ranked") ||
    format.includes("tournament") ||
    format.includes("bracket")
  );
}

export function resolveInitialChallengeStatus(input: ChallengeLifecycleInput, now = new Date()): ChallengeLifecycleStatus {
  if (!input.publish) return "draft";
  if (isAdvancedChallenge(input)) return "pending_review";

  const startsAt = parseDate(input.startsAt);
  const submissionDeadline = parseDate(input.submissionDeadline);
  const votingDeadline = parseDate(input.votingDeadline);

  if (!startsAt || !submissionDeadline || !votingDeadline) return "pending_review";
  if (startsAt > now) return "scheduled";
  if (now <= submissionDeadline) return "submission_open";
  if (now <= votingDeadline) return "voting_open";
  return "under_review";
}

export function resolveApprovedChallengeStatus(input: Pick<ChallengeLifecycleInput, "startsAt" | "submissionDeadline" | "votingDeadline">, now = new Date()): Exclude<ChallengeLifecycleStatus, "draft" | "pending_review" | "cancelled" | "paused"> {
  const startsAt = parseDate(input.startsAt);
  const submissionDeadline = parseDate(input.submissionDeadline);
  const votingDeadline = parseDate(input.votingDeadline);

  if (startsAt && startsAt > now) return "scheduled";
  if (submissionDeadline && now <= submissionDeadline) return "submission_open";
  if (votingDeadline && now <= votingDeadline) return "voting_open";
  if (startsAt || submissionDeadline || votingDeadline) return "under_review";
  return "scheduled";
}

export function buildChallengeApprovalUpdate(challenge: Record<string, unknown>, adminId: string, now: string) {
  const approvedStatus = resolveApprovedChallengeStatus({
    startsAt: String(challenge.startsAt ?? ""),
    submissionDeadline: String(challenge.submissionDeadline ?? ""),
    votingDeadline: String(challenge.votingDeadline ?? challenge.votingEndsAt ?? "")
  }, new Date(now));

  return {
    status: approvedStatus,
    lifecycleStatus: approvedStatus,
    publishedAt: challenge.publishedAt ?? now,
    adminReviewRequired: false,
    adminApprovalStatus: "approved",
    reviewedBy: adminId,
    reviewedAt: now,
    updatedAt: now
  };
}

export function buildChallengeRejectionUpdate(adminId: string, now: string) {
  return {
    status: "draft",
    lifecycleStatus: "draft",
    adminReviewRequired: false,
    adminApprovalStatus: "rejected",
    reviewedBy: adminId,
    reviewedAt: now,
    updatedAt: now
  };
}

export function shouldCountAgainstActiveChallengeLimit(status: unknown) {
  return activeChallengeLimitStatuses.includes(String(status) as ChallengeLifecycleStatus);
}
