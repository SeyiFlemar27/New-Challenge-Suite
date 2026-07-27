import { deterministicId } from "@/lib/server/idempotency";

export type ChallengeManagementState = "draft" | "pending_review" | "requires_changes" | "scheduled" | "active" | "completed" | "cancelled";

export interface ChallengeDraftProgress {
  completionPercentage: number;
  nextIncompleteSection: string | null;
  completedSections: string[];
  missingSections: string[];
}

function text(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function list(value: unknown) {
  return Array.isArray(value) ? value : [];
}

function bool(value: unknown) {
  return value === true || value === "true";
}

function monetizationRecord(challenge: Record<string, unknown>) {
  return typeof challenge.monetization === "object" && challenge.monetization !== null ? challenge.monetization as Record<string, unknown> : {};
}

export function resolveChallengeManagementState(challenge: Record<string, unknown>): ChallengeManagementState {
  const status = text(challenge.status ?? challenge.lifecycleStatus).toLowerCase();
  const reviewStatus = text(challenge.reviewStatus ?? challenge.adminDecision ?? challenge.adminReviewStatus).toLowerCase();
  if (reviewStatus === "changes_requested" || status === "changes_requested") return "requires_changes";
  if (status === "draft") return "draft";
  if (status === "pending_review") return "pending_review";
  if (status === "scheduled" || status === "approved") return "scheduled";
  if (["cancelled", "canceled"].includes(status)) return "cancelled";
  if (["completed", "winners_announced"].includes(status)) return "completed";
  return "active";
}

export function calculateChallengeDraftProgress(challenge: Record<string, unknown>): ChallengeDraftProgress {
  const monetization = monetizationRecord(challenge);
  const paidEntry = bool(monetization.paidEntryRequested) || bool(challenge.paidEntryEnabled) || bool(challenge.entryFeeRequired);
  const prizeRequested = bool(monetization.prizePoolRequested) || text(challenge.prizeType) === "money" || Number(challenge.prizeValue ?? 0) > 0;
  const sponsorReady = bool(monetization.sponsorReady) || bool(challenge.sponsorEnabled);
  const mediaOptional = bool(challenge.usesPlaceholderMedia) || text(challenge.mediaUploadStatus) === "storage_disabled";
  const checks: Array<{ section: string; complete: boolean }> = [
    { section: "Basics", complete: Boolean(text(challenge.title) && text(challenge.category)) },
    { section: "Description", complete: text(challenge.description).length >= 20 },
    { section: "Eligibility", complete: Boolean(text(challenge.standardRules ?? challenge.rules) && text(challenge.policyTerms)) },
    { section: "Schedule", complete: Boolean(text(challenge.startsAt) && text(challenge.registrationDeadline ?? challenge.submissionDeadline) && text(challenge.submissionDeadline) && text(challenge.votingDeadline ?? challenge.votingEndsAt) && text(challenge.endsAt)) },
    { section: "Submission Settings", complete: list(challenge.acceptedSubmissionTypes).length > 0 && Boolean(text(challenge.challengeGuidelines)) },
    { section: "Entry Settings", complete: !paidEntry || Number(monetization.entryFeeAmountCents ?? challenge.entryFeeAmountCents ?? challenge.entryFeeCents ?? 0) >= 500 },
    { section: "Prize Settings", complete: !prizeRequested || Number(challenge.numberOfWinners ?? 0) >= 1 },
    { section: "Media", complete: mediaOptional || Boolean(text(challenge.coverImageUrl) && text(challenge.coverImagePath)) },
    { section: "Review", complete: Boolean(text(challenge.title) && text(challenge.description) && list(challenge.acceptedSubmissionTypes).length > 0 && (!sponsorReady || list(monetization.placements ?? challenge.sponsorPlacementOptions).length > 0)) }
  ];
  const completedSections = checks.filter((item) => item.complete).map((item) => item.section);
  const missingSections = checks.filter((item) => !item.complete).map((item) => item.section);
  return {
    completionPercentage: Math.round((completedSections.length / checks.length) * 100),
    nextIncompleteSection: missingSections[0] ?? null,
    completedSections,
    missingSections
  };
}

export function draftAuditId(challengeId: string, userId: string, action: string, at: string) {
  return deterministicId("challenge_draft", challengeId, userId, action, at);
}

export function editableDraftStatus(challenge: Record<string, unknown>) {
  const state = resolveChallengeManagementState(challenge);
  return state === "draft" || state === "requires_changes";
}
