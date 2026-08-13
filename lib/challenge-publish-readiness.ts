import type { ChallengeValidationIssue, ChallengeValidationResult } from "@/lib/server/challenge-validation";

export type ChallengePublishBlockerCode =
  | "AUTHENTICATION_REQUIRED"
  | "PERMISSION_DENIED"
  | "ALREADY_UNDER_REVIEW"
  | "CHALLENGE_NOT_EDITABLE"
  | "PLAN_ACCESS_DENIED"
  | "MISSING_REQUIRED_DETAILS"
  | "INVALID_TIMELINE"
  | "MEDIA_REQUIRED"
  | "MEDIA_PROCESSING"
  | "MEDIA_UPLOAD_FAILED"
  | "PAID_ENTRY_INVALID"
  | "PRIZE_CONFIGURATION_INVALID";

export interface ChallengePublishBlocker {
  code: ChallengePublishBlockerCode;
  message: string;
}

const editableStatuses = new Set(["", "draft", "incomplete", "requires_changes", "needs_info", "changes_requested", "rejected"]);

function validationBlocker(errors: ChallengeValidationIssue[]): ChallengePublishBlocker | null {
  const blocking = errors.filter((issue) => issue.severity === "error");
  if (!blocking.length) return null;
  if (blocking.some((issue) => /date|time|deadline|startsAt|endsAt|registration/i.test(issue.field) || /TIMELINE|START|DEADLINE|VOTING|REGISTRATION/.test(issue.code))) {
    return { code: "INVALID_TIMELINE", message: "Your challenge timeline needs fixing." };
  }
  if (blocking.some((issue) => /coverImage|media/i.test(issue.field) || /BANNER|MEDIA/.test(issue.code))) {
    return { code: "MEDIA_REQUIRED", message: "Please add challenge media before publishing." };
  }
  if (blocking.some((issue) => /prize|winner/i.test(issue.field) || /PRIZE|WINNER/.test(issue.code))) {
    return { code: "PRIZE_CONFIGURATION_INVALID", message: "Prize funding needs attention." };
  }
  return { code: "MISSING_REQUIRED_DETAILS", message: "Some required details are missing." };
}

export function getChallengePublishBlocker(input: {
  authenticated: boolean;
  ownsChallenge?: boolean;
  status?: string | null;
  planAllowsChallenge: boolean;
  validation: ChallengeValidationResult;
  mediaMissing: boolean;
  mediaProcessing: boolean;
  mediaFailed: boolean;
  paidEntryRequested: boolean;
  entryFeeValid: boolean;
}): ChallengePublishBlocker | null {
  if (!input.authenticated) return { code: "AUTHENTICATION_REQUIRED", message: "Your session expired. Please sign in again." };
  if (input.ownsChallenge === false) return { code: "PERMISSION_DENIED", message: "You can't publish this challenge." };
  const status = String(input.status ?? "").toLowerCase();
  if (status === "pending_review") return { code: "ALREADY_UNDER_REVIEW", message: "This challenge is already under review." };
  if (!editableStatuses.has(status)) return { code: "CHALLENGE_NOT_EDITABLE", message: "This challenge has already been submitted." };
  if (!input.planAllowsChallenge) return { code: "PLAN_ACCESS_DENIED", message: "This feature isn't included in your plan." };
  if (input.mediaProcessing) return { code: "MEDIA_PROCESSING", message: "Your media is still processing. Try again shortly." };
  if (input.mediaFailed) return { code: "MEDIA_UPLOAD_FAILED", message: "Your media upload failed. Try again." };
  if (input.mediaMissing) return { code: "MEDIA_REQUIRED", message: "Please add challenge media before publishing." };
  if (input.paidEntryRequested && !input.entryFeeValid) return { code: "PAID_ENTRY_INVALID", message: "Paid entry setup needs attention." };
  return validationBlocker(input.validation.errors);
}

export function challengeReviewMonetizationLabels(input: {
  monetizationAllowed: boolean;
  paidEntryRequested: boolean;
  entryFeeValid: boolean;
  sponsorReady: boolean;
  prizePoolRequested: boolean;
  confirmedPrizeFundingCents: number;
}) {
  return {
    paidEntry: !input.paidEntryRequested ? "Off" : !input.monetizationAllowed ? "Not included in plan" : input.entryFeeValid ? "Ready" : "Needs setup",
    sponsorReady: !input.sponsorReady ? "Off" : !input.monetizationAllowed ? "Not included in plan" : "Needs review",
    prizePool: !input.prizePoolRequested ? "Off" : !input.monetizationAllowed ? "Not included in plan" : input.confirmedPrizeFundingCents > 0 ? "Uses confirmed funding" : "Needs review"
  };
}
