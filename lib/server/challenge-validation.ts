import { z } from "zod";
import { validateChallengeDates } from "@/lib/server/challenge-lifecycle";
import { DEFAULT_CHALLENGE_TIME_ZONE } from "@/lib/challenge-date-time";

export const serverChallengeCreateSchema = z.object({
  title: z.string().trim().max(120, "Title must be 120 characters or fewer.").default(""),
  description: z.string().trim().max(2000, "Description must be 2,000 characters or fewer.").default(""),
  category: z.string().trim().max(80).default(""),
  customCategory: z.string().trim().max(80).optional().or(z.literal("")),
  type: z.string().trim().optional(),
  visibility: z.enum(["public", "private", "exclusive"]).default("public"),
  premiumOnly: z.coerce.boolean().default(false),
  acceptedSubmissionTypes: z.array(z.enum(["image", "video"])).max(2).default([]),
  competitionFormat: z.string().trim().max(80).default(""),
  bestOf: z.enum(["1 Rounder", "Best of 3", "Best of 5", "Best of 7"]).default("1 Rounder"),
  startsAt: z.string().trim().default(""),
  endsAt: z.string().trim().default(""),
  submissionDeadline: z.string().trim().default(""),
  submissionStartAt: z.string().trim().optional(),
  votingDeadline: z.string().trim().default(""),
  votingStartsAt: z.string().trim().optional(),
  registrationDeadline: z.string().trim().optional(),
  votingEndsAt: z.string().trim().optional(),
  winnerAnnouncementAt: z.string().trim().optional(),
  timeZone: z.string().trim().max(80).default(DEFAULT_CHALLENGE_TIME_ZONE),
  lateRegistrationEnabled: z.coerce.boolean().default(false),
  standardRules: z.string().trim().max(6000).default(""),
  policyTerms: z.string().trim().max(6000).default(""),
  challengeGuidelines: z.string().trim().max(6000).default(""),
  coverImageUrl: z.string().trim().url("Cover image URL must be valid.").optional().or(z.literal("")),
  coverImagePath: z.string().trim().max(500).default(""),
  mediaUploadStatus: z.enum(["required", "uploaded", "storage_disabled"]).default("required"),
  mediaStatus: z.enum(["required", "uploaded", "skipped_storage_not_configured"]).default("required"),
  usesPlaceholderMedia: z.coerce.boolean().default(false),
  mediaFallbackType: z.string().trim().max(80).default(""),
  promoImageUrl: z.string().trim().url("Promo image URL must be valid.").optional().or(z.literal("")),
  promoImagePath: z.string().trim().max(500).default(""),
  trailerVideoUrl: z.string().trim().url("Trailer video URL must be valid.").optional().or(z.literal("")),
  trailerVideoPath: z.string().trim().max(500).default(""),
  promoVideoUrl: z.string().trim().url("Promo video URL must be valid.").optional().or(z.literal("")),
  promoVideoPath: z.string().trim().max(500).default(""),
  documentUrls: z.array(z.string().trim().url("Document URL must be valid.")).max(2).default([]),
  documentPaths: z.array(z.string().trim().max(500)).max(2).default([]),
  prizeType: z.enum(["none", "money", "physical_product", "digital_product", "bragging_rights"]).default("bragging_rights"),
  prizeTitle: z.string().trim().max(120).default(""),
  prizeDescription: z.string().trim().max(1200).default(""),
  prizeValue: z.coerce.number().min(0).max(100000000).default(0),
  prizeDeliveryNotes: z.string().trim().max(1200).default(""),
  numberOfWinners: z.coerce.number().int().min(1).max(100).default(1),
  winnerSelection: z.enum(["highest_votes", "judge_selection", "hybrid", "manual"]).default("highest_votes"),
  inviteCode: z.string().trim().max(80).default(""),
  accessCode: z.string().trim().max(80).default(""),
  votingSettings: z.object({
    allowFreeVotes: z.coerce.boolean().default(true),
    allowDoroCoinVotes: z.coerce.boolean().default(true),
    weightedVotes: z.coerce.boolean().default(true)
  }).default({ allowFreeVotes: true, allowDoroCoinVotes: true, weightedVotes: true }),
  requiresSubmissionApproval: z.coerce.boolean().default(false),
  requiresParticipantApproval: z.coerce.boolean().default(false),
  participantApprovalMode: z.enum(["automatic", "manual"]).default("automatic"),
  sponsorEnabled: z.coerce.boolean().default(false),
  sponsorSlots: z.coerce.number().int().min(0).max(20).default(0),
  minimumSponsorshipAmount: z.coerce.number().min(0).default(0),
  sponsorPlacementOptions: z.array(z.string().trim().min(1)).max(12).default([]),
  sponsorPackages: z.array(z.object({
    id: z.string().trim().min(1).max(80),
    name: z.string().trim().min(2).max(80),
    price: z.coerce.number().min(0).max(100000000),
    slotLimit: z.coerce.number().int().min(1).max(20),
    benefits: z.array(z.string().trim().min(1).max(160)).max(12).default([]),
    logoPlacement: z.coerce.boolean().default(false),
    ctaButton: z.coerce.boolean().default(false),
    leaderboardMention: z.coerce.boolean().default(false),
    winnerAnnouncementMention: z.coerce.boolean().default(false),
    feedBannerPlacement: z.coerce.boolean().default(false),
    campaignReportAvailable: z.coerce.boolean().default(false)
  })).max(12).default([]),
  monetization: z.object({
    enabled: z.coerce.boolean().default(false),
    paidEntryRequested: z.coerce.boolean().default(false),
    entryFeeAmountCents: z.coerce.number().int().min(0).max(100000000).default(0),
    currency: z.string().trim().max(3).default("USD"),
    sponsorReady: z.coerce.boolean().default(false),
    prizePoolRequested: z.coerce.boolean().default(false),
    paidVotesRequested: z.coerce.boolean().default(false),
    sponsorshipGoal: z.string().trim().max(240).default(""),
    preferredSponsorCategory: z.string().trim().max(120).default(""),
    sponsorNote: z.string().trim().max(1200).default(""),
    placements: z.array(z.string().trim().min(1).max(80)).max(12).default([]),
    status: z.enum(["not_requested", "setup_required", "pending_payment_setup", "active_foundation"]).default("not_requested"),
    paymentActive: z.coerce.boolean().default(false),
    checkoutActive: z.coerce.boolean().default(false),
    ledgerCreationEnabled: z.coerce.boolean().default(false),
    prizeReleaseActive: z.coerce.boolean().default(false),
    payoutReleaseActive: z.coerce.boolean().default(false)
  }).default({
    enabled: false,
    paidEntryRequested: false,
    entryFeeAmountCents: 0,
    currency: "USD",
    sponsorReady: false,
    prizePoolRequested: false,
    paidVotesRequested: false,
    sponsorshipGoal: "",
    preferredSponsorCategory: "",
    sponsorNote: "",
    placements: [],
    status: "not_requested",
    paymentActive: false,
    checkoutActive: false,
    ledgerCreationEnabled: false,
    prizeReleaseActive: false,
    payoutReleaseActive: false
  }),
  isLiveEvent: z.coerce.boolean().default(false),
  venueName: z.string().trim().max(160).default(""),
  eventAddress: z.string().trim().max(240).default(""),
  eventCity: z.string().trim().max(100).default(""),
  eventState: z.string().trim().max(100).default(""),
  eventCountry: z.string().trim().max(100).default(""),
  eventMapUrl: z.string().trim().url("Map link must be valid.").optional().or(z.literal("")),
  eventCapacity: z.coerce.number().int().min(0).max(50000).default(0),
  externalLiveUrl: z.string().trim().url("External livestream URL must be valid.").optional().or(z.literal("")),
  externalLiveProvider: z.string().trim().max(80).default(""),
  externalLiveStatus: z.enum(["not_ready", "scheduled", "live", "ended"]).default("not_ready"),
  externalLiveOpensAt: z.string().trim().optional().or(z.literal("")),
  externalLiveCtaLabel: z.string().trim().max(80).default("Watch live on partner site"),
  tournamentType: z.enum(["none", "one_vs_one", "group", "knockout", "bracket", "league_table", "audition_to_final", "group_stage_to_final", "custom_rounds"]).default("none"),
  tournamentStages: z.array(z.object({
    id: z.string().trim().min(1).max(80),
    name: z.string().trim().min(1).max(120),
    order: z.coerce.number().int().min(1).max(50),
    status: z.enum(["draft", "registration", "active", "completed", "locked"]).default("draft"),
    advancementRule: z.string().trim().max(240).default("")
  })).max(20).default([]),
  divisionFormat: z.coerce.number().int().refine((value) => [2, 4, 6].includes(value), "Division format must be 2, 4, or 6.").default(2),
  maxParticipants: z.coerce.number().int().min(2).max(50).default(50),
  scoringMode: z.enum(["best_of", "points"]).default("best_of"),
  bestOfRounds: z.coerce.number().int().refine((value) => [3, 5, 7].includes(value), "Best-of scoring must be 3, 5, or 7.").default(3),
  pointsToWin: z.coerce.number().int().min(1).max(100000).default(10),
  timerEnabled: z.coerce.boolean().default(false),
  timerDuration: z.coerce.number().int().min(0).max(86400).default(0),
  roundDuration: z.coerce.number().int().min(0).max(86400).default(0),
  judgeScoringEnabled: z.coerce.boolean().default(false),
  hostOperations: z.object({
    visibilityMode: z.enum(["public", "invite_only", "access_code", "approved_list", "hidden", "public_preview"]).default("public"),
    accessCode: z.string().trim().max(80).default(""),
    format: z.enum(["single_round", "multi_round", "knockout", "leaderboard", "judge_reviewed", "submission_voting", "registration_only"]).default("single_round"),
    minimumAge: z.coerce.number().int().min(0).max(120).default(0),
    locationRestriction: z.string().trim().max(160).default(""),
    approvalRequired: z.coerce.boolean().default(false),
    registrationQuestions: z.array(z.string().trim().min(1).max(240)).max(20).default([]),
    termsRequired: z.coerce.boolean().default(true),
    submissionType: z.enum(["image", "video", "text", "link"]).default("image"),
    maxFileSizeMb: z.coerce.number().int().min(1).max(500).default(25),
    maxVideoDurationSeconds: z.coerce.number().int().min(0).max(14400).default(0),
    allowResubmission: z.coerce.boolean().default(false),
    votesPerUserPerDay: z.coerce.number().int().min(0).max(100).default(1),
    showVoteCount: z.coerce.boolean().default(true),
    showLeaderboard: z.coerce.boolean().default(true),
    winnerSelection: z.enum(["highest_votes", "judge_selection", "hybrid", "manual"]).default("highest_votes"),
    multipleWinners: z.coerce.boolean().default(false),
    placementMode: z.enum(["single", "top_three", "categories"]).default("single"),
    prizeSponsor: z.string().trim().max(160).default(""),
    manualPayoutNote: z.string().trim().max(1200).default(""),
    eventLogoUrl: z.string().trim().url("Event logo URL must be valid.").optional().or(z.literal("")),
    sponsorBannerUrl: z.string().trim().url("Sponsor banner URL must be valid.").optional().or(z.literal("")),
    brandColor: z.string().trim().regex(/^#[0-9a-fA-F]{6}$/, "Brand color must be a six-digit hex color.").default("#F5B700"),
    allowSponsorInterest: z.coerce.boolean().default(false),
    showSponsorRequestButton: z.coerce.boolean().default(false),
    sponsorCategories: z.array(z.string().trim().min(1).max(80)).max(12).default([]),
    sponsorVisibilityAreas: z.array(z.string().trim().min(1).max(120)).max(12).default([]),
    launchMode: z.enum(["draft", "publish", "schedule"]).default("draft")
  }).optional(),
  publish: z.coerce.boolean().default(false)
}).superRefine((value, ctx) => {
  if (value.timerEnabled && value.timerDuration <= 0) {
    ctx.addIssue({ code: "custom", path: ["timerDuration"], message: "Timer duration must be greater than zero." });
  }
  const hasAnySchedule = Boolean(value.startsAt || value.endsAt || value.submissionDeadline || value.votingDeadline);
  if (!value.publish && hasAnySchedule) {
    const dateResult = validateChallengeDates(value);
    for (const [field, message] of Object.entries(dateResult.fieldErrors)) {
      if (value.publish || value[field as keyof typeof value]) ctx.addIssue({ code: "custom", path: [field], message });
    }
  }
});

export type ServerChallengeCreateInput = z.infer<typeof serverChallengeCreateSchema>;

export function zodFieldErrors(error: z.ZodError) {
  const fieldErrors: Record<string, string> = {};
  for (const issue of error.issues) {
    const field = String(issue.path[0] ?? "challenge");
    fieldErrors[field] = issue.message;
  }
  return fieldErrors;
}

export type ChallengeValidationSeverity = "error" | "warning";

export interface ChallengeValidationIssue {
  code: string;
  field: string;
  step: string;
  message: string;
  severity: ChallengeValidationSeverity;
}

export interface ChallengeValidationResult {
  valid: boolean;
  errors: ChallengeValidationIssue[];
  missingCount: number;
  groupedByStep: Record<string, ChallengeValidationIssue[]>;
}

export interface ChallengeValidationContext {
  mode?: "create" | "edit" | "publish" | "admin_review";
  userId?: string;
  isAdmin?: boolean;
  now?: Date;
}

type ChallengeLike = Partial<ServerChallengeCreateInput> & Record<string, unknown>;

function text(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function list(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function bool(value: unknown) {
  return value === true || value === "true";
}

function numberValue(value: unknown) {
  const next = Number(value);
  return Number.isFinite(next) ? next : 0;
}

function dateValue(value: unknown) {
  const raw = text(value);
  if (!raw) return null;
  const date = new Date(raw);
  return Number.isNaN(date.getTime()) ? null : date;
}

function challengeKind(challenge: ChallengeLike) {
  const type = text(challenge.type).toLowerCase();
  const format = text(challenge.competitionFormat).toLowerCase();
  const hostFormat = typeof challenge.hostOperations === "object" && challenge.hostOperations ? text((challenge.hostOperations as Record<string, unknown>).format).toLowerCase() : "";
  const tournamentType = text(challenge.tournamentType).toLowerCase();
  return {
    isPrivate: [text(challenge.visibility), type, typeof challenge.hostOperations === "object" && challenge.hostOperations ? text((challenge.hostOperations as Record<string, unknown>).visibilityMode) : ""].some((value) => /private|exclusive|invite|access_code|approved_list/.test(value.toLowerCase())),
    isLive: bool(challenge.isLiveEvent) || /live event|physical/.test(type),
    isTournament: tournamentType !== "" && tournamentType !== "none" || /tournament|bracket|knockout/.test(`${type} ${format} ${hostFormat}`),
    livestreamEnabled: Boolean(text(challenge.externalLiveUrl) || text(challenge.externalLiveProvider) || text(challenge.externalLiveOpensAt) || text(challenge.externalLiveStatus) === "scheduled")
  };
}

function grouped(errors: ChallengeValidationIssue[]) {
  return errors.reduce<Record<string, ChallengeValidationIssue[]>>((acc, issue) => {
    acc[issue.step] = acc[issue.step] ?? [];
    acc[issue.step].push(issue);
    return acc;
  }, {});
}

function validationResult(errors: ChallengeValidationIssue[]): ChallengeValidationResult {
  return {
    valid: !errors.some((issue) => issue.severity === "error"),
    errors,
    missingCount: errors.filter((issue) => issue.severity === "error").length,
    groupedByStep: grouped(errors)
  };
}

function makeIssue(errors: ChallengeValidationIssue[], code: string, field: string, step: string, message: string, severity: ChallengeValidationSeverity = "error") {
  errors.push({ code, field, step, message, severity });
}

function requireText(errors: ChallengeValidationIssue[], challenge: ChallengeLike, field: string, step: string, message: string, minLength = 1) {
  if (text(challenge[field]).length < minLength) makeIssue(errors, `REQUIRED_${field.replace(/([A-Z])/g, "_$1").toUpperCase()}`, field, step, message);
}

function requireDate(errors: ChallengeValidationIssue[], challenge: ChallengeLike, field: string, step: string, message: string) {
  if (!dateValue(challenge[field])) makeIssue(errors, `REQUIRED_${field.replace(/([A-Z])/g, "_$1").toUpperCase()}`, field, step, message);
}

function validStoragePath(path: string, prefixes: string[]) {
  return Boolean(path && prefixes.some((prefix) => path.startsWith(prefix)) && !path.includes("..") && !/^https?:/i.test(path));
}

function storageDisabledEnvFlag() {
  return process.env.NEXT_PUBLIC_DISABLE_MEDIA_UPLOADS === "true";
}

function storageBucketConfiguredForValidation() {
  const bucket = (process.env.FIREBASE_STORAGE_BUCKET || process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET || "").trim().replace(/^gs:\/\//i, "").replace(/\/+$/g, "");
  return Boolean(bucket);
}

function canSkipCoverMedia(challenge: Record<string, unknown>) {
  const status = text(challenge.mediaUploadStatus);
  const mediaStatus = text(challenge.mediaStatus);
  const fallbackType = text(challenge.mediaFallbackType);
  const requestedSkippedMedia = status === "storage_disabled"
    && mediaStatus === "skipped_storage_not_configured"
    && challenge.usesPlaceholderMedia === true
    && fallbackType === "challenge_suite_placeholder";
  return requestedSkippedMedia && (storageDisabledEnvFlag() || !storageBucketConfiguredForValidation());
}

export function validateChallengeForDraft(challenge: ChallengeLike): ChallengeValidationResult {
  const errors: ChallengeValidationIssue[] = [];
  if (text(challenge.title).length > 120) makeIssue(errors, "TITLE_TOO_LONG", "title", "Basics", "Challenge title must be 120 characters or fewer.");
  if (text(challenge.description).length > 2000) makeIssue(errors, "DESCRIPTION_TOO_LONG", "description", "Basics", "Challenge description must be 2,000 characters or fewer.");
  if (list(challenge.acceptedSubmissionTypes).some((item) => !["image", "video"].includes(String(item)))) makeIssue(errors, "INVALID_MEDIA_TYPE", "acceptedSubmissionTypes", "Format", "Accepted media types must be image, video, or both.");
  const mediaPathFields = ["coverImagePath", "promoImagePath", "trailerVideoPath", "promoVideoPath", ...list(challenge.documentPaths).map((_, index) => `documentPaths.${index}`)];
  for (const field of mediaPathFields) {
    const value = field.startsWith("documentPaths.") ? text(list(challenge.documentPaths)[Number(field.split(".")[1])]) : text(challenge[field]);
    if (value && (/^https?:/i.test(value) || value.includes(".."))) makeIssue(errors, "INVALID_MEDIA_PATH", field, "Media", "Media storage paths must be internal Firebase Storage paths.");
  }
  return validationResult(errors);
}

export function validateChallengeForPublish(challenge: ChallengeLike, context: ChallengeValidationContext = {}): ChallengeValidationResult {
  const errors: ChallengeValidationIssue[] = [];
  const now = context.now ?? new Date();
  const kind = challengeKind(challenge);
  const hostOps = typeof challenge.hostOperations === "object" && challenge.hostOperations ? challenge.hostOperations as Record<string, unknown> : null;

  requireText(errors, challenge, "title", "Basics", "Add a challenge title.", 3);
  requireText(errors, challenge, "description", "Basics", "Add a complete description.", 20);
  requireText(errors, challenge, "category", "Basics", "Select a category.");
  requireText(errors, challenge, "type", "Basics", "Select a challenge type.");
  requireText(errors, challenge, "competitionFormat", "Format & Rules", "Select a competition format.");
  if (!list(challenge.acceptedSubmissionTypes).length) makeIssue(errors, "REQUIRED_ACCEPTED_MEDIA_TYPE", "acceptedSubmissionTypes", "Format & Rules", "Select at least one accepted media type.");
  requireText(errors, challenge, "standardRules", "Format & Rules", "Add at least one competition rule.", 10);
  requireText(errors, challenge, "challengeGuidelines", "Format & Rules", "Add submission requirements or challenge guidelines.", 10);
  requireText(errors, challenge, "policyTerms", "Format & Rules", "Add eligibility or participation terms.", 10);

  requireDate(errors, challenge, "startsAt", "Schedule", "Add a challenge start date.");
  requireDate(errors, challenge, "endsAt", "Schedule", "Add a challenge end date.");
  requireDate(errors, challenge, "submissionDeadline", "Schedule", "Please set a submission deadline before publishing this challenge.");
  requireDate(errors, challenge, "votingDeadline", "Schedule", "Add a voting deadline.");
  if (!text(challenge.votingStartsAt)) makeIssue(errors, "REQUIRED_VOTING_START", "votingStartsAt", "Schedule", "Add a voting opening date or use the submission deadline as the voting start.", "warning");
  if (!text(challenge.registrationDeadline)) makeIssue(errors, "REQUIRED_REGISTRATION_CLOSE", "registrationDeadline", "Schedule", "Add a registration closing date.", "warning");
  if (!text(challenge.timeZone)) makeIssue(errors, "REQUIRED_TIME_ZONE", "timeZone", "Schedule", "Confirm the challenge time zone.", "warning");

  const startsAt = dateValue(challenge.startsAt);
  const endsAt = dateValue(challenge.endsAt);
  const submissionDeadline = dateValue(challenge.submissionDeadline);
  const submissionStartAt = dateValue(challenge.submissionStartAt ?? challenge.startsAt);
  const votingStartsAt = dateValue(challenge.votingStartsAt ?? challenge.submissionDeadline);
  const votingDeadline = dateValue(challenge.votingDeadline);
  const registrationDeadline = dateValue(challenge.registrationDeadline);
  const externalLiveOpensAt = dateValue(challenge.externalLiveOpensAt);

  if (startsAt && startsAt <= now && !context.isAdmin) makeIssue(errors, "START_DATE_IN_PAST", "startsAt", "Schedule", "Newly published challenges must start in the future.");
  if (startsAt && endsAt && startsAt >= endsAt) makeIssue(errors, "START_AFTER_END", "startsAt", "Schedule", "Challenge start date must be before the end date.");
  if (!submissionStartAt) makeIssue(errors, "REQUIRED_SUBMISSION_START", "submissionStartAt", "Schedule", "Please set when submissions open.");
  if (submissionStartAt && submissionDeadline && submissionDeadline <= submissionStartAt) makeIssue(errors, "SUBMISSION_DEADLINE_NOT_AFTER_START", "submissionDeadline", "Schedule", "Submission deadline must be after the challenge/submission start time.");
  if (submissionDeadline && votingDeadline && submissionDeadline > votingDeadline) makeIssue(errors, "SUBMISSION_AFTER_VOTING_CLOSE", "submissionDeadline", "Schedule", "Submission deadline must be before or at the voting/review close time.");
  if (votingStartsAt && votingDeadline && votingStartsAt >= votingDeadline) makeIssue(errors, "VOTING_START_AFTER_CLOSE", "votingStartsAt", "Schedule", "Voting must open before voting closes.");
  if (votingDeadline && endsAt && votingDeadline >= endsAt) makeIssue(errors, "VOTING_AFTER_END", "votingDeadline", "Schedule", "Winner announcement must be after voting/review closes.");
  if (registrationDeadline && submissionStartAt && registrationDeadline > submissionStartAt) makeIssue(errors, "REGISTRATION_AFTER_START", "registrationDeadline", "Schedule", "Registration or invite close must be before or at the challenge/submission start time.");
  if (kind.livestreamEnabled && externalLiveOpensAt && startsAt && externalLiveOpensAt > startsAt) makeIssue(errors, "LIVESTREAM_AFTER_START", "externalLiveOpensAt", "Schedule", "Livestream access should open before the live challenge begins.");

  const ownerId = text(challenge.creatorId) || context.userId || "";
  const challengeId = text(challenge.id);
  const coverUrl = text(challenge.coverImageUrl);
  const coverPath = text(challenge.coverImagePath);
  const coverMediaSkipped = canSkipCoverMedia(challenge);
  const allowedDraftPrefixes = ownerId ? [`challenges/drafts/${ownerId}/`, `challenges/host-drafts/${ownerId}/`, `challenges/hybrid-drafts/${ownerId}/`, `live-events/drafts/${ownerId}/media/`, `live-events/hybrid-drafts/${ownerId}/media/`] : [];
  const allowedChallengePrefixes = challengeId ? [`challenges/${challengeId}/banner/`, `challenges/${challengeId}/gallery/`, `challenges/${challengeId}/video/`, `challenges/${challengeId}/documents/`, `challenges/${challengeId}/trailers/`, `challenges/${challengeId}/promo-flyer/`, `challenges/${challengeId}/promo-video/`] : [];
  const allowedMediaPrefixes = [...allowedDraftPrefixes, ...allowedChallengePrefixes];
  if ((!coverUrl || !coverPath) && !coverMediaSkipped) makeIssue(errors, "REQUIRED_BANNER", "coverImageUrl", "Media", "Upload a challenge banner.");
  else if (!coverMediaSkipped && !validStoragePath(coverPath, allowedMediaPrefixes)) makeIssue(errors, "INVALID_BANNER_STORAGE_PATH", "coverImagePath", "Media", "Challenge banner storage path must belong to this challenge or owner draft path.");
  for (const field of ["promoImagePath", "trailerVideoPath", "promoVideoPath"]) {
    const value = text(challenge[field]);
    if (value && !validStoragePath(value, allowedMediaPrefixes)) makeIssue(errors, "INVALID_MEDIA_STORAGE_PATH", field, "Media", "Optional media storage paths must belong to this challenge or owner draft path.");
  }
  for (const [index, value] of list(challenge.documentPaths).map(text).entries()) {
    if (value && !validStoragePath(value, allowedMediaPrefixes)) makeIssue(errors, "INVALID_MEDIA_STORAGE_PATH", `documentPaths.${index}`, "Media", "Optional document storage paths must belong to this challenge or owner draft path.");
  }

  requireText(errors, challenge, "visibility", "Access", "Select challenge visibility.");
  if (kind.isPrivate) {
    const accessCode = text(hostOps?.accessCode ?? challenge.inviteCode ?? challenge.accessCode);
    const hasInviteFoundation = Boolean(accessCode || text(challenge.inviteCode) || text(challenge.accessCode) || bool(hostOps?.approvalRequired));
    if (!hasInviteFoundation) makeIssue(errors, "PRIVATE_INVITE_REQUIRED", "visibility", "Access", "Add invitation settings for private challenges.");
  }

  const prizeType = text(challenge.prizeType) || "bragging_rights";
  if (!prizeType) makeIssue(errors, "REQUIRED_PRIZE_TYPE", "prizeType", "Prizes", "Select prize information.");
  if (!["none", "bragging_rights"].includes(prizeType) && !text(challenge.prizeTitle)) makeIssue(errors, "REQUIRED_PRIZE_TITLE", "prizeTitle", "Prizes", "Add prize title for product or money prize metadata.");
  if (!["none"].includes(prizeType) && !text(challenge.winnerSelection ?? hostOps?.winnerSelection)) makeIssue(errors, "REQUIRED_WINNER_SELECTION", "winnerSelection", "Prizes", "Select the winner-selection method.");
  if (numberValue(challenge.numberOfWinners ?? (bool(hostOps?.multipleWinners) ? 3 : 1)) <= 0) makeIssue(errors, "REQUIRED_WINNER_COUNT", "numberOfWinners", "Prizes", "Select the number of winners.");

  if (kind.isLive) {
    if (!text(challenge.venueName)) makeIssue(errors, "LIVE_LOCATION_REQUIRED", "venueName", "Live Event", "Add the physical event venue.");
    if (!text(challenge.eventCity)) makeIssue(errors, "LIVE_CITY_REQUIRED", "eventCity", "Live Event", "Add the physical event city.");
    if (!text(challenge.eventCountry)) makeIssue(errors, "LIVE_COUNTRY_REQUIRED", "eventCountry", "Live Event", "Add the physical event country.");
  }
  if (kind.livestreamEnabled && !text(challenge.externalLiveUrl)) makeIssue(errors, "LIVESTREAM_URL_REQUIRED", "externalLiveUrl", "Live Event", "Configure livestream details or disable livestreaming.");

  if (kind.isTournament) {
    if (text(challenge.tournamentType) === "none") makeIssue(errors, "TOURNAMENT_TYPE_REQUIRED", "tournamentType", "Tournament", "Select a tournament type.");
    if (!list(challenge.tournamentStages).length) makeIssue(errors, "TOURNAMENT_STAGES_REQUIRED", "tournamentStages", "Tournament", "Add tournament bracket or round configuration.");
  }

  const draftResult = validateChallengeForDraft(challenge);
  errors.push(...draftResult.errors);
  return validationResult(errors);
}

