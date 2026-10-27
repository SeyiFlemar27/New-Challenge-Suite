/** New records only. The v3 constants and funded legacy contracts remain unchanged. */
export const INDIVIDUAL_TOURNAMENT_POLICY = "individual_tournament_v4_20261026" as const;
export const INDIVIDUAL_TOURNAMENT_CAPACITIES = [4, 8, 16, 32] as const;
export const INDIVIDUAL_TOURNAMENT_PLACEMENTS = [50, 30, 20] as const;
export const INDIVIDUAL_TOURNAMENT_DURATIONS = [12, 24, 48, 72] as const;
export const INDIVIDUAL_TOURNAMENT_RESERVATION_MS = 10 * 60 * 1000;
export const INDIVIDUAL_TOURNAMENT_ACTIVATION_MS = 5 * 1000;
export const INDIVIDUAL_TOURNAMENT_EXTENSION_MS = 12 * 60 * 60 * 1000;

export function isIndividualTournamentPolicy(record: Record<string, unknown>) {
  return record.productPolicyVersion === INDIVIDUAL_TOURNAMENT_POLICY && record.configVersion === 4;
}

export function individualTournamentPolicyIssues(record: Record<string, unknown>) {
  const errors: Array<{ field: string; message: string }> = [];
  if (!isIndividualTournamentPolicy(record)) errors.push({ field: "productPolicyVersion", message: "Individual Tournament policy and configuration version must agree." });
  if (record.participationMode !== "individual") errors.push({ field: "participationMode", message: "New Tournaments support individual competitors only." });
  if (!(INDIVIDUAL_TOURNAMENT_CAPACITIES as readonly unknown[]).includes(record.participantCapacity)) errors.push({ field: "participantCapacity", message: "Choose 4, 8, 16, or 32 individual competitors." });
  if (!["single_elimination", "double_elimination"].includes(String(record.format))) errors.push({ field: "format", message: "Choose Single or Double Elimination." });
  if (record.privacy !== "public" || record.registrationType !== "open") errors.push({ field: "registration", message: "New Tournaments use public, open registration." });
  const distribution = record.prizeDistribution;
  if (!Array.isArray(distribution) || distribution.length !== 3 || distribution.some((row, index) => row?.placement !== index + 1 || row?.percent !== INDIVIDUAL_TOURNAMENT_PLACEMENTS[index])) errors.push({ field: "prizeDistribution", message: "New Individual Tournaments allocate 50% / 30% / 20% of the distributable prize pool." });
  return errors;
}

/** Canonical UTC calendar day; display/profile timezone never changes the guard. */
export function individualTournamentVoteDay(now: Date) {
  if (!Number.isFinite(now.getTime())) throw new Error("INVALID_TOURNAMENT_VOTE_TIME");
  return now.toISOString().slice(0, 10);
}
