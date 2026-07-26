import { TOURNAMENT_STATUSES, type TournamentFormat, type TournamentPrivacy, type TournamentRegistrationType, type TournamentThirdPlaceMethod, type TournamentTieBreaker } from "@/lib/tournament-types";

export const SINGLE_ELIMINATION_CAPACITIES = [8, 16, 32, 64] as const;
export const TOURNAMENT_FORMATS: TournamentFormat[] = ["single_elimination"];
export const TOURNAMENT_PRIVACY: TournamentPrivacy[] = ["public", "private", "invite_only"];
export const TOURNAMENT_REGISTRATION_TYPES: TournamentRegistrationType[] = ["open", "approval_required", "invite_only"];
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
  const registrationOpensAt = dateValue(input.registrationOpensAt);
  const registrationClosesAt = dateValue(input.registrationClosesAt);
  const tournamentStartsAt = dateValue(input.tournamentStartsAt);
  const expectedEndAt = dateValue(input.expectedEndAt);
  if (!text(input.title)) errors.push({ field: "title", message: "Tournament title is required." });
  if (!text(input.description)) errors.push({ field: "description", message: "Tournament description is required." });
  if (!text(input.category)) errors.push({ field: "category", message: "Tournament category is required." });
  if (!TOURNAMENT_FORMATS.includes(format)) errors.push({ field: "format", message: "Tournament format is invalid." });
  if (format !== "single_elimination") errors.push({ field: "format", message: "V1 tournaments support single elimination only." });
  if (capacity < 2) errors.push({ field: "participantCapacity", message: "Participant capacity is required." });
  if (format === "single_elimination" && !SINGLE_ELIMINATION_CAPACITIES.includes(capacity as typeof SINGLE_ELIMINATION_CAPACITIES[number])) errors.push({ field: "participantCapacity", message: "Single elimination tournaments require 8, 16, 32, or 64 participants." });
  if (!TOURNAMENT_PRIVACY.includes(text(input.privacy || "public") as TournamentPrivacy)) errors.push({ field: "privacy", message: "Tournament privacy is invalid." });
  if (!TOURNAMENT_REGISTRATION_TYPES.includes(text(input.registrationType || "open") as TournamentRegistrationType)) errors.push({ field: "registrationType", message: "Tournament registration type is invalid." });
  if (!TOURNAMENT_TIE_BREAKERS.includes(text(input.tieBreaker || "host_review") as TournamentTieBreaker)) errors.push({ field: "tieBreaker", message: "Tournament tie-breaker is invalid." });
  if (!TOURNAMENT_THIRD_PLACE.includes(text(input.thirdPlaceMethod || "none") as TournamentThirdPlaceMethod)) errors.push({ field: "thirdPlaceMethod", message: "Tournament third-place method is invalid." });
  if (registrationOpensAt && registrationClosesAt && registrationOpensAt >= registrationClosesAt) errors.push({ field: "registrationClosesAt", message: "Registration must close after it opens." });
  if (registrationClosesAt && tournamentStartsAt && registrationClosesAt >= tournamentStartsAt) errors.push({ field: "tournamentStartsAt", message: "Registration must close before the tournament starts." });
  if (tournamentStartsAt && expectedEndAt && tournamentStartsAt >= expectedEndAt) errors.push({ field: "expectedEndAt", message: "Expected end must be after tournament start." });
  const prizeDistributionTotal = percentTotal(input.prizeDistribution);
  if (prizeDistributionTotal !== null && prizeDistributionTotal !== 100) errors.push({ field: "prizeDistribution", message: "Prize distribution total must equal 100." });
  const hybridScoreTotal = percentTotal(input.hybridScoring);
  if (hybridScoreTotal !== null && hybridScoreTotal !== 100) errors.push({ field: "hybridScoring", message: "Hybrid scoring total must equal 100." });
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
