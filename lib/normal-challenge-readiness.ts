import { NORMAL_CHALLENGE_STEPS, NORMAL_RESUBMIT_WINDOWS, isNormalChallengeV2 } from "@/lib/normal-challenge-config";
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
function record(value: unknown) { return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {}; }
function date(value: unknown) { const parsed = Date.parse(text(value)); return Number.isFinite(parsed) ? parsed : null; }
function bool(value: unknown) { return value === true || value === "true"; }
function issue(items: NormalChallengeIssue[], code: string, field: string, step: number, message: string) { items.push({ code, field, step, message }); }

function hasStorageMedia(item: unknown) {
  const media = record(item);
  return Boolean(text(media.url) && text(media.path) && !/^https?:/i.test(text(media.path)) && !text(media.path).includes(".."));
}

export function getNormalChallengeReadiness(challenge: Record<string, unknown>): NormalChallengeReadiness {
  const issues: NormalChallengeIssue[] = [];
  const v2 = isNormalChallengeV2(challenge);
  const monetization = record(challenge.monetization);

  if (text(challenge.title).length < 3) issue(issues, "TITLE_REQUIRED", "title", 0, "Add a challenge title.");
  if (v2 && text(challenge.shortDescription).length < 10) issue(issues, "SHORT_DESCRIPTION_REQUIRED", "shortDescription", 0, "Add a short description of at least 10 characters.");
  if (text(challenge.description).length < 20) issue(issues, "DESCRIPTION_REQUIRED", "description", 0, "Write a full description of at least 20 characters.");
  if (!text(challenge.category)) issue(issues, "CATEGORY_REQUIRED", "category", 0, "Choose a category.");
  if (v2 && !text(challenge.subcategory)) issue(issues, "SUBCATEGORY_REQUIRED", "subcategory", 0, "Choose a subcategory.");

  const mode = text(challenge.participationMode) || (bool(challenge.requiresParticipantApproval) ? "approval" : "open");
  if (!["open", "approval"].includes(mode)) issue(issues, "PARTICIPATION_MODE_REQUIRED", "participationMode", 1, "Choose who can join.");
  const locationMode = text(challenge.locationEligibility) || (text(challenge.eligibleCountry) ? "selected" : "worldwide");
  if (v2 && locationMode === "selected" && !list(challenge.eligibleCountries).length) issue(issues, "COUNTRIES_REQUIRED", "eligibleCountries", 1, "Select at least one eligible country.");
  const ageMode = text(challenge.ageRestrictionMode) || (number(challenge.minimumAge) > 0 ? "minimum" : "none");
  const minAge = number(challenge.minimumAge);
  if (ageMode === "minimum" && (minAge < 13 || minAge > 120)) issue(issues, "MINIMUM_AGE_INVALID", "minimumAge", 1, "Set a minimum age between 13 and 120.");
  const capacityIssue = normalChallengeCapacityError(challenge.maxParticipants);
  if (capacityIssue) issue(issues, "CAPACITY_INVALID", "maxParticipants", 1, capacityIssue);

  const paid = bool(monetization.paidEntryRequested) || bool(challenge.paidEntryEnabled);
  const fee = number(monetization.entryFeeAmountCents ?? challenge.entryFeeAmountCents);
  if (paid && (fee < 500 || fee > 10000000)) issue(issues, "ENTRY_FEE_INVALID", "entryFeeAmountCents", 2, "Add an entry fee between $5 and $100,000.");
  const winners = Math.trunc(number(challenge.numberOfWinners));
  if (winners < 1 || winners > 3) issue(issues, "WINNER_COUNT_INVALID", "numberOfWinners", 2, "Choose between one and three winner placements.");
  const prizeAmounts = list(challenge.winnerPrizeAmountsCents).map(Number);
  if (v2) {
    if (text(challenge.prizeType) !== "money") issue(issues, "CASH_PRIZE_REQUIRED", "prizeType", 2, "Normal Challenges require a cash prize.");
    if (prizeAmounts.length !== winners || prizeAmounts.some((amount) => !Number.isInteger(amount) || amount <= 0)) issue(issues, "PRIZE_AMOUNTS_INVALID", "winnerPrizeAmountsCents", 2, "Add a valid cash amount for every winner placement.");
  } else {
    const splits = list(challenge.winnerSplits).map(Number);
    if (splits.length !== winners || Math.round(splits.reduce((sum, value) => sum + value, 0)) !== 100) issue(issues, "WINNER_SPLIT_INVALID", "winnerSplits", 2, "Winner placement percentages must total 100%.");
  }

  if (v2) {
    const images = list(challenge.challengeImages);
    if (!images.length || !hasStorageMedia(images[0])) issue(issues, "PRIMARY_IMAGE_REQUIRED", "challengeImages", 3, "Upload at least one storage-confirmed challenge image.");
    if (images.length > 3) issue(issues, "IMAGE_LIMIT_EXCEEDED", "challengeImages", 3, "You can upload up to three challenge images.");
    if (images.some((item) => !hasStorageMedia(item))) issue(issues, "IMAGE_NOT_CONFIRMED", "challengeImages", 3, "Wait for every challenge image to finish uploading.");
    if (images.some((item) => text(record(item).moderationStatus) === "rejected")) issue(issues, "IMAGE_REJECTED", "challengeImages", 3, "Remove media that did not pass review and upload a replacement.");
    if (challenge.challengeVideo && !hasStorageMedia(challenge.challengeVideo)) issue(issues, "VIDEO_NOT_CONFIRMED", "challengeVideo", 3, "Wait for the challenge video to finish uploading.");
    if (challenge.challengeVideo && text(record(challenge.challengeVideo).moderationStatus) === "rejected") issue(issues, "VIDEO_REJECTED", "challengeVideo", 3, "Remove the video that did not pass review or upload a replacement.");
  } else {
    if (!text(challenge.coverImageUrl) || !text(challenge.coverImagePath)) issue(issues, "COVER_MEDIA_REQUIRED", "coverImageUrl", 3, "Add storage-confirmed cover media.");
  }

  const joinOpen = date(challenge.registrationOpensAt);
  const joinClose = date(challenge.registrationDeadline);
  const submissionOpen = date(challenge.submissionStartAt ?? challenge.startsAt);
  const submissionClose = date(challenge.submissionDeadline);
  const votingOpen = date(challenge.votingStartsAt);
  const votingClose = date(challenge.votingDeadline ?? challenge.votingEndsAt);
  const winnerAt = date(challenge.winnerAnnouncementAt ?? challenge.endsAt);
  if (!text(challenge.timeZone ?? challenge.timezone)) issue(issues, "TIMEZONE_REQUIRED", "timeZone", 4, "Choose a challenge timezone.");
  if (!submissionOpen) issue(issues, "SUBMISSION_OPEN_REQUIRED", "submissionStartAt", 4, "Set when submissions open.");
  if (!submissionClose) issue(issues, "SUBMISSION_CLOSE_REQUIRED", "submissionDeadline", 4, "Set the submission deadline.");
  if (!votingOpen) issue(issues, "VOTING_OPEN_REQUIRED", "votingStartsAt", 4, "Set when voting opens.");
  if (!votingClose) issue(issues, "VOTING_CLOSE_REQUIRED", "votingDeadline", 4, "Set when voting closes.");
  if (!winnerAt) issue(issues, "WINNER_TIME_REQUIRED", "winnerAnnouncementAt", 4, "Set the results announcement time.");
  if (joinOpen && joinClose && joinClose <= joinOpen) issue(issues, "JOIN_ORDER_INVALID", "registrationDeadline", 4, "The join window must close after it opens.");
  if (joinClose && submissionOpen && joinClose > submissionOpen) issue(issues, "JOIN_AFTER_SUBMISSION", "registrationDeadline", 4, "The join window must close before or when submissions open.");
  if (submissionOpen && submissionClose && submissionClose <= submissionOpen) issue(issues, "SUBMISSION_ORDER_INVALID", "submissionDeadline", 4, "Submission deadline must be after submissions open.");
  if (submissionClose && votingOpen && votingOpen < submissionClose) issue(issues, "VOTING_BEFORE_SUBMISSION_CLOSE", "votingStartsAt", 4, "Voting must open at or after submissions close.");
  if (votingOpen && votingClose && votingClose <= votingOpen) issue(issues, "VOTING_ORDER_INVALID", "votingDeadline", 4, "Voting must close after it opens.");
  if (votingClose && winnerAt && winnerAt < votingClose) issue(issues, "RESULTS_ORDER_INVALID", "winnerAnnouncementAt", 4, "Results cannot be announced before voting closes.");

  const types = list(challenge.acceptedSubmissionTypes).map(String);
  if (!types.length || types.some((value) => !["image", "video"].includes(value))) issue(issues, "SUBMISSION_TYPE_REQUIRED", "acceptedSubmissionTypes", 5, "Choose Image, Video, or Image or Video.");
  if (text(challenge.challengeGuidelines).length < 10) issue(issues, "SUBMISSION_INSTRUCTIONS_REQUIRED", "challengeGuidelines", 5, "Add submission instructions.");
  const resubmitHours = number(challenge.fixAndResubmitHours ?? 24);
  if (bool(challenge.fixAndResubmitEnabled) && !NORMAL_RESUBMIT_WINDOWS.includes(resubmitHours as 12 | 24 | 48 | 72)) issue(issues, "RESUBMIT_PERIOD_INVALID", "fixAndResubmitHours", 5, "Choose a 12, 24, 48, or 72 hour correction window.");

  if (v2) {
    const confirmations = record(challenge.publishConfirmations);
    if (!bool(confirmations.accurate)) issue(issues, "CONFIRM_ACCURATE", "publishConfirmations", 7, "Confirm that the challenge details are accurate.");
    if (!bool(confirmations.rights)) issue(issues, "CONFIRM_RIGHTS", "publishConfirmations", 7, "Confirm that you have the rights to the content and media.");
    if (!bool(confirmations.review)) issue(issues, "CONFIRM_REVIEW", "publishConfirmations", 7, "Confirm that the challenge will be reviewed before it goes public.");
  }

  const steps = NORMAL_CHALLENGE_STEPS.map((label, step) => ({
    label,
    issues: issues.filter((item) => item.step === step),
    complete: step === 6 ? !issues.some((item) => item.step < 6) : !issues.some((item) => item.step === step)
  }));
  const firstIncomplete = steps.findIndex((item) => !item.complete);
  return { ready: issues.length === 0, steps, issues, nextRequiredStep: firstIncomplete < 0 ? 7 : firstIncomplete };
}

export function firstIssueForStep(challenge: Record<string, unknown>, step: number) {
  return getNormalChallengeReadiness(challenge).issues.find((item) => item.step === step) ?? null;
}

export function normalChallengeSubmitIssue(details: unknown) {
  if (!details || typeof details !== "object") return null;
  const fieldErrors = (details as { fieldErrors?: unknown }).fieldErrors;
  if (!fieldErrors || typeof fieldErrors !== "object" || Array.isArray(fieldErrors)) return null;
  if (Object.prototype.hasOwnProperty.call(fieldErrors, "maxParticipants")) return { field: "maxParticipants", step: 1, message: NORMAL_CHALLENGE_CAPACITY_ERROR };
  const firstField = Object.keys(fieldErrors)[0];
  const stepByField: Record<string, number> = { title: 0, shortDescription: 0, description: 0, category: 0, subcategory: 0, maxParticipants: 1, minimumAge: 1, entryFeeAmountCents: 2, numberOfWinners: 2, winnerPrizeAmountsCents: 2, challengeImages: 3, timeZone: 4, submissionStartAt: 4, submissionDeadline: 4, votingStartsAt: 4, votingDeadline: 4, winnerAnnouncementAt: 4, acceptedSubmissionTypes: 5, challengeGuidelines: 5 };
  return { field: firstField || "challenge", step: stepByField[firstField] ?? null, message: "Some required details need attention." };
}
