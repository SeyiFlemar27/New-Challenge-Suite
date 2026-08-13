import { NORMAL_CHALLENGE_STEPS } from "@/lib/challenge-builder-foundation";
import { NORMAL_CHALLENGE_CAPACITY_ERROR, normalChallengeCapacityError } from "@/lib/normal-challenge-capacity";

export type NormalChallengeIssue = { code: string; field: string; step: number; message: string };
export type NormalChallengeReadiness = {
  ready: boolean;
  steps: Array<{ label: string; complete: boolean; issues: NormalChallengeIssue[] }>;
  issues: NormalChallengeIssue[];
  nextRequiredStep: number;
};

function text(value: unknown) { return typeof value === "string" ? value.trim() : ""; }
function number(value: unknown) { const next = Number(value); return Number.isFinite(next) ? next : 0; }
function list(value: unknown) { return Array.isArray(value) ? value : []; }
function date(value: unknown) { const parsed = Date.parse(text(value)); return Number.isFinite(parsed) ? parsed : null; }
function bool(value: unknown) { return value === true || value === "true"; }
function issue(items: NormalChallengeIssue[], code: string, field: string, step: number, message: string) { items.push({ code, field, step, message }); }

export function getNormalChallengeReadiness(challenge: Record<string, unknown>): NormalChallengeReadiness {
  const issues: NormalChallengeIssue[] = [];
  const monetization = challenge.monetization && typeof challenge.monetization === "object" ? challenge.monetization as Record<string, unknown> : {};
  if (text(challenge.title).length < 3) issue(issues, "TITLE_REQUIRED", "title", 0, "Add a challenge title.");
  if (text(challenge.description).length < 20) issue(issues, "DESCRIPTION_REQUIRED", "description", 0, "Write a challenge description of at least 20 characters.");
  if (!text(challenge.category)) issue(issues, "CATEGORY_REQUIRED", "category", 0, "Choose a category.");
  if (text(challenge.standardRules).length < 10) issue(issues, "RULES_REQUIRED", "standardRules", 0, "Add clear challenge rules.");
  const coverType = text(challenge.coverMediaType) || "image";
  if (!text(challenge.coverImageUrl) || !text(challenge.coverImagePath)) issue(issues, "COVER_MEDIA_REQUIRED", "coverImageUrl", 0, coverType === "video" ? "Add a storage-confirmed video thumbnail." : "Add storage-confirmed cover media.");
  if (coverType === "video" && (!text(challenge.trailerVideoUrl) || !text(challenge.trailerVideoPath))) issue(issues, "COVER_VIDEO_REQUIRED", "trailerVideoUrl", 0, "Add the storage-confirmed cover video.");

  const mode = text(challenge.participationMode) || (bool(challenge.requiresParticipantApproval) ? "approval" : "open");
  if (!['open', 'approval'].includes(mode)) issue(issues, "PARTICIPATION_MODE_REQUIRED", "participationMode", 1, "Choose Open Participation or Approval Required.");
  const capacityIssue = normalChallengeCapacityError(challenge.maxParticipants);
  if (capacityIssue) issue(issues, "CAPACITY_INVALID", "maxParticipants", 1, capacityIssue);
  const minAge = number(challenge.minimumAge); const maxAge = number(challenge.maximumAge);
  if (minAge && maxAge && minAge > maxAge) issue(issues, "AGE_RANGE_INVALID", "minimumAge", 1, "Minimum age cannot be greater than maximum age.");

  const paid = bool(monetization.paidEntryRequested) || bool(challenge.paidEntryEnabled);
  const fee = number(monetization.entryFeeAmountCents ?? challenge.entryFeeAmountCents);
  if (paid && (fee < 500 || fee > 10000000)) issue(issues, "ENTRY_FEE_INVALID", "entryFeeAmountCents", 2, "Add an entry fee between $5 and $100,000.");
  if (!list(challenge.acceptedSubmissionTypes).length) issue(issues, "SUBMISSION_TYPE_REQUIRED", "acceptedSubmissionTypes", 2, "Choose at least one submission type.");
  if (text(challenge.challengeGuidelines).length < 10) issue(issues, "SUBMISSION_INSTRUCTIONS_REQUIRED", "challengeGuidelines", 2, "Add submission instructions.");
  const resubmitHours = number(challenge.fixAndResubmitHours ?? 24);
  if (bool(challenge.fixAndResubmitEnabled) && (resubmitHours < 1 || resubmitHours > 168)) issue(issues, "RESUBMIT_PERIOD_INVALID", "fixAndResubmitHours", 2, "Set a Fix & Resubmit period between 1 and 168 hours.");

  if (text(challenge.competitionFormat).toLowerCase() !== "public voting") issue(issues, "COMPETITION_FORMAT_INVALID", "competitionFormat", 3, "Normal Challenges use Public Voting.");

  const winners = Math.trunc(number(challenge.numberOfWinners));
  if (winners < 1 || winners > 3) issue(issues, "WINNER_COUNT_INVALID", "numberOfWinners", 4, "Choose between one and three winner placements.");
  const splits = list(challenge.winnerSplits).map(Number);
  if (splits.length !== winners || Math.round(splits.reduce((sum, value) => sum + value, 0)) !== 100) issue(issues, "WINNER_SPLIT_INVALID", "winnerSplits", 4, "Winner placement percentages must total 100%.");
  if (text(challenge.prizeType) === "money" && (number(challenge.prizeValue) <= 0 || text(challenge.prizeCurrency || monetization.currency) !== "USD")) issue(issues, "CASH_PRIZE_INVALID", "prizeValue", 4, "Add a valid USD cash prize amount.");

  const registrationOpen = date(challenge.registrationOpensAt);
  const registrationClose = date(challenge.registrationDeadline);
  const submissionOpen = date(challenge.submissionStartAt ?? challenge.startsAt);
  const submissionClose = date(challenge.submissionDeadline);
  const votingOpen = date(challenge.votingStartsAt);
  const votingClose = date(challenge.votingDeadline ?? challenge.votingEndsAt);
  const winnerAt = date(challenge.winnerAnnouncementAt ?? challenge.endsAt);
  if (!text(challenge.timeZone ?? challenge.timezone)) issue(issues, "TIMEZONE_REQUIRED", "timeZone", 5, "Choose a challenge timezone.");
  if (!submissionOpen) issue(issues, "SUBMISSION_OPEN_REQUIRED", "submissionStartAt", 5, "Set when submissions open.");
  if (!submissionClose) issue(issues, "SUBMISSION_CLOSE_REQUIRED", "submissionDeadline", 5, "Set the submission deadline.");
  if (!votingOpen) issue(issues, "VOTING_OPEN_REQUIRED", "votingStartsAt", 5, "Set when voting opens.");
  if (!votingClose) issue(issues, "VOTING_CLOSE_REQUIRED", "votingDeadline", 5, "Set when voting closes.");
  if (!winnerAt) issue(issues, "WINNER_TIME_REQUIRED", "winnerAnnouncementAt", 5, "Set the winner announcement time.");
  if (registrationOpen && registrationClose && registrationClose <= registrationOpen) issue(issues, "REGISTRATION_ORDER_INVALID", "registrationDeadline", 5, "Registration must close after it opens.");
  if (registrationClose && submissionOpen && registrationClose > submissionOpen) issue(issues, "REGISTRATION_AFTER_SUBMISSION", "registrationDeadline", 5, "Registration must close before or when submissions open.");
  if (submissionOpen && submissionClose && submissionClose <= submissionOpen) issue(issues, "SUBMISSION_ORDER_INVALID", "submissionDeadline", 5, "Submission deadline must be after submissions open.");
  if (submissionClose && votingOpen && votingOpen < submissionClose) issue(issues, "VOTING_BEFORE_SUBMISSION_CLOSE", "votingStartsAt", 5, "Voting must open at or after submissions close.");
  if (votingOpen && votingClose && votingClose <= votingOpen) issue(issues, "VOTING_ORDER_INVALID", "votingDeadline", 5, "Voting must close after it opens.");
  if (votingClose && winnerAt && winnerAt <= votingClose) issue(issues, "WINNER_ORDER_INVALID", "winnerAnnouncementAt", 5, "Winner announcement must be after voting closes.");

  const steps = NORMAL_CHALLENGE_STEPS.map((label, step) => ({ label, issues: issues.filter((item) => item.step === step), complete: step === 6 ? issues.length === 0 : !issues.some((item) => item.step === step) }));
  return { ready: issues.length === 0, steps, issues, nextRequiredStep: Math.max(0, steps.findIndex((item) => !item.complete)) };
}

export function firstIssueForStep(challenge: Record<string, unknown>, step: number) {
  return getNormalChallengeReadiness(challenge).issues.find((item) => item.step === step) ?? null;
}

export function normalChallengeSubmitIssue(details: unknown) {
  if (!details || typeof details !== "object") return null;
  const fieldErrors = (details as { fieldErrors?: unknown }).fieldErrors;
  if (!fieldErrors || typeof fieldErrors !== "object" || Array.isArray(fieldErrors)) return null;
  if (Object.prototype.hasOwnProperty.call(fieldErrors, "maxParticipants")) {
    return { field: "maxParticipants", step: 1, message: NORMAL_CHALLENGE_CAPACITY_ERROR };
  }
  return { field: "challenge", step: null, message: "Some required details need attention." };
}
