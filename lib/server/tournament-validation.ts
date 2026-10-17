import { TOURNAMENT_STATUSES, type TournamentFormat, type TournamentPrivacy, type TournamentRegistrationType, type TournamentThirdPlaceMethod, type TournamentTieBreaker } from "@/lib/tournament-types";
import { isCanonicalChallengeCategory, isCanonicalChallengeSubcategory } from "@/lib/normal-challenge-config";
import { validateOwnedStorageMedia } from "@/lib/server/media-storage-validation";
import { TOURNAMENT_PRODUCT_POLICY } from "@/lib/tournament-builder-policy";

export const TOURNAMENT_CAPACITY_MIN = 4;
export const TOURNAMENT_CAPACITY_MAX = 128;
export const TOURNAMENT_BRACKET_SIZES = [4, 8, 16, 32, 64, 128] as const;
export const TOURNAMENT_FORMATS: TournamentFormat[] = ["single_elimination", "double_elimination"];
export const TOURNAMENT_PRIVACY: TournamentPrivacy[] = ["public", "private", "invite_only"];
export const TOURNAMENT_REGISTRATION_TYPES: TournamentRegistrationType[] = ["open", "invite_only"];
export const TOURNAMENT_TIE_BREAKERS: TournamentTieBreaker[] = ["pre_recorded_priority", "host_review", "judge_review", "higher_seed", "rematch", "sudden_death_voting", "predefined_rule"];
export const TOURNAMENT_THIRD_PLACE: TournamentThirdPlaceMethod[] = ["none", "third_place_match", "bronze_match", "score_based"];

export type TournamentValidationIssue = { field: string; message: string };

function text(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function dateValue(value: unknown) {
  if (!value) return null;
  const date = new Date(String(value));
  return Number.isNaN(date.getTime()) ? null : date;
}

function percentTotal(values: unknown) {
  if (!Array.isArray(values)) return null;
  return values.reduce((sum, item) => sum + Number((item as Record<string, unknown>)?.percent ?? 0), 0);
}

export function validateTournamentFoundation(input: Record<string, unknown>, options: { publish?: boolean; ownerId?: string; validateMedia?: boolean } = {}) {
  const errors: TournamentValidationIssue[] = [];
  const format = text(input.format || "single_elimination") as TournamentFormat;
  const configVersion = Number(input.configVersion ?? 2);
  const capacity = Number(input.participantCapacity ?? 0);
  const participationMode = text(input.participationMode || "individual");
  const registrationOpensAt = dateValue(input.registrationOpensAt);
  const registrationClosesAt = dateValue(input.registrationClosesAt);
  const tournamentStartsAt = dateValue(input.tournamentStartsAt);
  const expectedEndAt = dateValue(input.expectedEndAt);
  if (options.publish && !text(input.title)) errors.push({ field: "title", message: "Tournament title is required." });
  if (text(input.title).length > 120) errors.push({ field: "title", message: "Tournament title must be 120 characters or fewer." });
  if (input.basePrizeAmountMinor !== undefined) {
    const basePrize = Number(input.basePrizeAmountMinor);
    if (!Number.isSafeInteger(basePrize) || basePrize < 0 || (basePrize > 0 && basePrize < 500)) errors.push({ field: "basePrizeAmountMinor", message: "Choose no Base Prize or a Base Prize of at least $5." });
  }
  if (input.teamPaymentWindowMinutes !== undefined && ![30, 60, 90, 120].includes(Number(input.teamPaymentWindowMinutes))) errors.push({ field: "teamPaymentWindowMinutes", message: "Choose a 30, 60, 90, or 120 minute team payment window." });
  if (input.submissionMediaTypes !== undefined && (!Array.isArray(input.submissionMediaTypes) || !input.submissionMediaTypes.length || input.submissionMediaTypes.some(value => value !== "image" && value !== "video"))) errors.push({ field: "submissionMediaTypes", message: "Choose Image, Video, or Image and/or Video." });
  for (const field of ["tournamentRules", "submissionInstructions"] as const) {
    if (input[field] !== undefined && typeof input[field] !== "string" && (!Array.isArray(input[field]) || (input[field] as unknown[]).some(value => typeof value !== "string"))) errors.push({ field, message: "Use ordered text items." });
  }
  if (options.publish && !text(input.description)) errors.push({ field: "description", message: "Tournament description is required." });
  if (configVersion >= 3 && ((options.publish && text(input.description).length < 20) || text(input.description).length > 1200)) errors.push({ field: "description", message: "Tournament description must be 20–1,200 characters." });
  const category = text(input.category);
  const subcategory = text(input.subcategory);
  if (options.publish && !category) errors.push({ field: "category", message: "Tournament category is required." });
  else if (category && !isCanonicalChallengeCategory(category)) errors.push({ field: "category", message: "Choose a category from the available options." });
  if (options.publish && !subcategory) errors.push({ field: "subcategory", message: "Tournament subcategory is required." });
  else if (subcategory && !isCanonicalChallengeSubcategory(category, subcategory)) errors.push({ field: "subcategory", message: "Choose a subcategory that belongs to the selected category." });
  if (text(input.currency || "USD") !== "USD") errors.push({ field: "currency", message: "Tournament money values are recorded in USD." });
  if (input.productPolicyVersion === TOURNAMENT_PRODUCT_POLICY) {
    if (text(input.privacy || "public") !== "public" || text(input.registrationType || "open") !== "open") errors.push({ field: "registration", message: "New Tournaments use public discovery and open eligible registration." });
    if (input.entryType === "paid_entry_setup_required" && (!Number.isSafeInteger(Number(input.entryFeeAmountMinor)) || Number(input.entryFeeAmountMinor) < 500)) errors.push({ field: "entryFeeAmountMinor", message: "Paid entry must be at least $5 per individual or team member." });
  }
  const minimumAge = Number(input.ageRestriction ?? 0);
  if (!Number.isInteger(minimumAge) || minimumAge < 0 || minimumAge > 120) errors.push({ field: "ageRestriction", message: "Minimum age must be a whole number from 0 to 120." });
  if (!TOURNAMENT_FORMATS.includes(format)) errors.push({ field: "format", message: "Tournament format is invalid." });
  if (!["single_elimination", "double_elimination"].includes(format)) errors.push({ field: "format", message: "Choose Single Elimination or Double Elimination." });
  if (!Number.isInteger(capacity) || !TOURNAMENT_BRACKET_SIZES.includes(capacity as typeof TOURNAMENT_BRACKET_SIZES[number])) errors.push({ field: "participantCapacity", message: "Choose a bracket size of 4, 8, 16, 32, 64, or 128." });
  if (!["individual", "team"].includes(participationMode)) errors.push({ field: "participationMode", message: "Choose Individual or Team tournament participation." });
  if (!TOURNAMENT_PRIVACY.includes(text(input.privacy || "public") as TournamentPrivacy)) errors.push({ field: "privacy", message: "Tournament privacy is invalid." });
  if (!TOURNAMENT_REGISTRATION_TYPES.includes(text(input.registrationType || "open") as TournamentRegistrationType)) errors.push({ field: "registrationType", message: "Tournament registration type is invalid." });
  if (configVersion >= 3 && text(input.registrationType || "open") === "approval_required") errors.push({ field: "registrationType", message: "New Tournament registrations cannot require creator approval." });
  if (participationMode === "team") {
    const team = input.teamConfig && typeof input.teamConfig === "object" ? input.teamConfig as Record<string, unknown> : {};
    const minimum = Number(input.minimumTeamSize ?? team.minimumSize ?? 0);
    const maximum = Number(input.maximumTeamSize ?? team.maximumSize ?? 0);
    if (!Number.isInteger(minimum) || !Number.isInteger(maximum) || minimum < 1 || minimum > maximum || maximum > 20) errors.push({ field: "teamSize", message: "Team size must satisfy 1 <= minimum <= maximum <= 20." });
    if (!["invite_only", "invite_and_requests"].includes(text(input.teamJoiningMode ?? team.joiningMode))) errors.push({ field: "teamJoiningMode", message: "Choose Invite Only or Invite + Join Requests." });
  }
  if (text(input.seedingMethod || "ranking") === "manual" && configVersion >= 2) errors.push({ field: "seedingMethod", message: "New tournaments do not allow manual seeding." });
  if (!TOURNAMENT_TIE_BREAKERS.includes(text(input.tieBreaker || "host_review") as TournamentTieBreaker)) errors.push({ field: "tieBreaker", message: "Tournament tie-breaker is invalid." });
  if (!TOURNAMENT_THIRD_PLACE.includes(text(input.thirdPlaceMethod || "none") as TournamentThirdPlaceMethod)) errors.push({ field: "thirdPlaceMethod", message: "Tournament third-place method is invalid." });
  if (configVersion >= 3) {
    if (text(input.seedingMethod || "random") !== "random") errors.push({ field: "seedingMethod", message: "New Tournament brackets use server-generated random pairings." });
    if (text(input.resultMethod || "votes") !== "votes") errors.push({ field: "resultMethod", message: "New Tournament match results are determined by validated public votes." });
    if (text(input.tieBreaker || "pre_recorded_priority") !== "pre_recorded_priority") errors.push({ field: "tieBreaker", message: "New Tournaments use the approved deterministic tie policy." });
    if (![12, 24, 48, 72].includes(Number(input.submissionDurationHours ?? 48))) errors.push({ field: "submissionDurationHours", message: "Submission duration must be 12, 24, 48, or 72 hours." });
    if (![12, 24, 48, 72].includes(Number(input.votingDurationHours ?? 72))) errors.push({ field: "votingDurationHours", message: "Voting duration must be 12, 24, 48, or 72 hours." });
    if (input.requiresCheckIn === true || text(input.checkInClosesAt) || text(input.registrationOpensAt) || text(input.registrationClosesAt) || text(input.tournamentStartsAt) || text(input.expectedEndAt)) errors.push({ field: "registration", message: "New Tournament registration cannot use fixed opening/closing dates or mandatory check-in." });
    const expectedThirdPlace = format === "single_elimination" ? "third_place_match" : "none";
    if (text(input.thirdPlaceMethod || expectedThirdPlace) !== expectedThirdPlace) errors.push({ field: "thirdPlaceMethod", message: "Third-place rules are determined by the selected elimination format." });
  }
  if (registrationOpensAt && registrationClosesAt && registrationOpensAt >= registrationClosesAt) errors.push({ field: "registrationClosesAt", message: "Registration must close after it opens." });
  if (registrationClosesAt && tournamentStartsAt && registrationClosesAt >= tournamentStartsAt) errors.push({ field: "tournamentStartsAt", message: "Registration must close before the tournament starts." });
  if (tournamentStartsAt && expectedEndAt && tournamentStartsAt >= expectedEndAt) errors.push({ field: "expectedEndAt", message: "Expected end must be after tournament start." });
  const prizeDistributionTotal = percentTotal(input.prizeDistribution);
  if (prizeDistributionTotal !== null && prizeDistributionTotal !== (configVersion >= 3 ? 100 : 65)) errors.push({ field: "prizeDistribution", message: configVersion >= 3 ? "Winner placement allocations must total 100% of the winners’ share." : "Legacy winner allocations must total 65% of eligible generated revenue." });
  if (configVersion >= 3 && Array.isArray(input.prizeDistribution)) {
    const allocations = input.prizeDistribution as Array<Record<string, unknown>>;
    const expected = [60, 25, 15];
    if (allocations.length !== expected.length || allocations.some((item, index) => Number(item.placement) !== index + 1 || Number(item.percent) !== expected[index])) {
      errors.push({ field: "prizeDistribution", message: "New Tournaments use the fixed 60% / 25% / 15% winner placement allocation." });
    }
  }
  const hybridScoreTotal = percentTotal(input.hybridScoring);
  if (hybridScoreTotal !== null && hybridScoreTotal !== 100) errors.push({ field: "hybridScoring", message: "Hybrid scoring total must equal 100." });
  if (text(input.resultMethod) === "hybrid" && configVersion >= 2) errors.push({ field: "resultMethod", message: "Hybrid scoring is not supported for new Tournament configuration." });
  const roundPlan = Array.isArray(input.roundPlan) ? input.roundPlan : [];
  if (options.validateMedia !== false) {
    const cover = input.coverMedia && typeof input.coverMedia === "object" ? input.coverMedia as Record<string, unknown> : {};
    const trailer = input.trailerMedia && typeof input.trailerMedia === "object" ? input.trailerMedia as Record<string, unknown> : {};
    const coverUrl = text(input.coverImageUrl ?? cover.url), coverPath = text(input.coverImagePath ?? cover.path);
    if (options.publish && (!coverUrl || !coverPath)) errors.push({ field: "coverImagePath", message: "Upload at least one verified creator image before Admin Review." });
    const mediaPrefixes = options.ownerId ? [`tournaments/drafts/${options.ownerId}/`] : [];
    const gallery = input.galleryMedia === undefined ? [] : input.galleryMedia;
    if (!Array.isArray(gallery) || gallery.length > 2) errors.push({ field: "galleryMedia", message: "Use at most two additional images." });
    else gallery.forEach((item, index) => {
      const record = item && typeof item === "object" ? item as Record<string, unknown> : {};
      const media = validateOwnedStorageMedia({ url: text(record.url), path: text(record.path), prefixes: options.ownerId ? [`tournaments/drafts/${options.ownerId}/cover/`] : [] });
      if (!media.valid || !text(record.path)) errors.push({ field: `galleryMedia.${index}`, message: "Upload an owned additional image." });
    });
    for (const [field, url, path] of [
      ["coverImageUrl", coverUrl, coverPath],
      ["trailerUrl", text(input.trailerUrl ?? trailer.url), text(input.trailerPath ?? trailer.path)]
    ] as const) {
      const media = validateOwnedStorageMedia({ url, path, prefixes: mediaPrefixes });
      if (!media.valid) errors.push({ field, message: media.message });
    }
  }
  roundPlan.forEach((round, index) => {
    const record = round as Record<string, unknown>;
    const submissionDeadlineAt = dateValue(record.submissionDeadlineAt);
    const votingOpensAt = dateValue(record.votingOpensAt);
    const votingClosesAt = dateValue(record.votingClosesAt);
    if (!text(record.title)) errors.push({ field: `roundPlan.${index}.title`, message: "Round title is required." });
    if (submissionDeadlineAt && votingOpensAt && submissionDeadlineAt > votingOpensAt) errors.push({ field: `roundPlan.${index}.votingOpensAt`, message: "Voting cannot open before the submission deadline." });
    if (votingOpensAt && votingClosesAt && votingOpensAt >= votingClosesAt) errors.push({ field: `roundPlan.${index}.votingClosesAt`, message: "Voting must close after it opens." });
  });
  if (options.publish && !TOURNAMENT_STATUSES.includes(text(input.status || "draft") as any)) errors.push({ field: "status", message: "Tournament status is invalid." });
  return { valid: errors.length === 0, errors };
}
