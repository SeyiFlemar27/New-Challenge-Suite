import { TOURNAMENT_STATUSES, type TournamentFormat, type TournamentPrivacy, type TournamentRegistrationType, type TournamentThirdPlaceMethod, type TournamentTieBreaker } from "@/lib/tournament-types";

export const TOURNAMENT_CAPACITY_MIN = 4;
export const TOURNAMENT_CAPACITY_MAX = 128;
export const TOURNAMENT_BRACKET_SIZES = [4, 8, 16, 32, 64, 128] as const;
export const TOURNAMENT_FORMATS: TournamentFormat[] = ["single_elimination", "double_elimination"];
export const TOURNAMENT_PRIVACY: TournamentPrivacy[] = ["public", "private", "invite_only"];
export const TOURNAMENT_REGISTRATION_TYPES: TournamentRegistrationType[] = ["open", "invite_only"];
export const TOURNAMENT_TIE_BREAKERS: TournamentTieBreaker[] = ["host_review", "judge_review", "higher_seed", "rematch", "sudden_death_voting", "predefined_rule"];
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

export function validateTournamentFoundation(input: Record<string, unknown>, options: { publish?: boolean } = {}) {
  const errors: TournamentValidationIssue[] = [];
  const format = text(input.format || "single_elimination") as TournamentFormat;
  const capacity = Math.trunc(Number(input.participantCapacity ?? 0));
  const participationMode = text(input.participationMode || "individual");
  const registrationOpensAt = dateValue(input.registrationOpensAt);
  const registrationClosesAt = dateValue(input.registrationClosesAt);
  const tournamentStartsAt = dateValue(input.tournamentStartsAt);
  const expectedEndAt = dateValue(input.expectedEndAt);
  if (!text(input.title)) errors.push({ field: "title", message: "Tournament title is required." });
  if (!text(input.description)) errors.push({ field: "description", message: "Tournament description is required." });
  if (!text(input.category)) errors.push({ field: "category", message: "Tournament category is required." });
  if (!TOURNAMENT_FORMATS.includes(format)) errors.push({ field: "format", message: "Tournament format is invalid." });
  if (!["single_elimination", "double_elimination"].includes(format)) errors.push({ field: "format", message: "Choose Single Elimination or Double Elimination." });
  if (!TOURNAMENT_BRACKET_SIZES.includes(capacity as typeof TOURNAMENT_BRACKET_SIZES[number])) errors.push({ field: "participantCapacity", message: "Choose a bracket size of 4, 8, 16, 32, 64, or 128." });
  if (!["individual", "team"].includes(participationMode)) errors.push({ field: "participationMode", message: "Choose Individual or Team tournament participation." });
  if (!TOURNAMENT_PRIVACY.includes(text(input.privacy || "public") as TournamentPrivacy)) errors.push({ field: "privacy", message: "Tournament privacy is invalid." });
  if (!TOURNAMENT_REGISTRATION_TYPES.includes(text(input.registrationType || "open") as TournamentRegistrationType)) errors.push({ field: "registrationType", message: "Tournament registration type is invalid." });
  if (participationMode === "team") {
    const minimum = Number(input.minimumTeamSize ?? 0);
    const maximum = Number(input.maximumTeamSize ?? 0);
    if (!Number.isInteger(minimum) || !Number.isInteger(maximum) || minimum < 1 || minimum > maximum || maximum > 20) errors.push({ field: "teamSize", message: "Team size must satisfy 1 <= minimum <= maximum <= 20." });
    if (!["invite_only", "invite_and_requests"].includes(text(input.teamJoiningMode))) errors.push({ field: "teamJoiningMode", message: "Choose Invite Only or Invite + Join Requests." });
  }
  if (text(input.seedingMethod || "ranking") === "manual" && Number(input.configVersion ?? 2) >= 2) errors.push({ field: "seedingMethod", message: "New tournaments use performance-based seeding." });
  if (!TOURNAMENT_TIE_BREAKERS.includes(text(input.tieBreaker || "host_review") as TournamentTieBreaker)) errors.push({ field: "tieBreaker", message: "Tournament tie-breaker is invalid." });
  if (!TOURNAMENT_THIRD_PLACE.includes(text(input.thirdPlaceMethod || "none") as TournamentThirdPlaceMethod)) errors.push({ field: "thirdPlaceMethod", message: "Tournament third-place method is invalid." });
  if (registrationOpensAt && registrationClosesAt && registrationOpensAt >= registrationClosesAt) errors.push({ field: "registrationClosesAt", message: "Registration must close after it opens." });
  if (registrationClosesAt && tournamentStartsAt && registrationClosesAt >= tournamentStartsAt) errors.push({ field: "tournamentStartsAt", message: "Registration must close before the tournament starts." });
  if (tournamentStartsAt && expectedEndAt && tournamentStartsAt >= expectedEndAt) errors.push({ field: "expectedEndAt", message: "Expected end must be after tournament start." });
  const prizeDistributionTotal = percentTotal(input.prizeDistribution);
  if (prizeDistributionTotal !== null && prizeDistributionTotal !== 65) errors.push({ field: "prizeDistribution", message: "Winner allocations must total 65% of eligible generated revenue." });
  const hybridScoreTotal = percentTotal(input.hybridScoring);
  if (hybridScoreTotal !== null && hybridScoreTotal !== 100) errors.push({ field: "hybridScoring", message: "Hybrid scoring total must equal 100." });
  if (text(input.resultMethod) === "hybrid" && Number(input.configVersion ?? 2) >= 2) errors.push({ field: "resultMethod", message: "Hybrid is unavailable until normalized scoring is configured." });
  const roundPlan = Array.isArray(input.roundPlan) ? input.roundPlan : [];
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
