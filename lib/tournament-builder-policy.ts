export const TOURNAMENT_PRODUCT_POLICY = "tournament_v3_20261015" as const;
export const TOURNAMENT_PLACEMENT_SPLITS = [{ placement: 1, percent: 60 }, { placement: 2, percent: 25 }, { placement: 3, percent: 15 }] as const;
export const TOURNAMENT_TEAM_PAYMENT_WINDOWS = [30, 60, 90, 120] as const;
export const TOURNAMENT_BUILDER_STEP_KEYS = ["overview", "format", "registration", "monetization", "media", "rounds", "review"] as const;
export type TournamentBuilderStepKey = typeof TOURNAMENT_BUILDER_STEP_KEYS[number];

/** Old nine-step drafts retain their position in the combined timing section. */
export function tournamentBuilderStep(value: unknown, navigationVersion?: unknown): TournamentBuilderStepKey {
  if (typeof value === "string" && TOURNAMENT_BUILDER_STEP_KEYS.includes(value as TournamentBuilderStepKey)) return value as TournamentBuilderStepKey;
  if (typeof value === "string") {
    if (["method", "schedule", "submissions"].includes(value)) return "rounds";
    if (value === "eligibility") return "registration";
  }
  const index = typeof value === "number" ? value : Number.NaN;
  if (!Number.isInteger(index) || index < 0) return "overview";
  if (Number(navigationVersion) === 2) return TOURNAMENT_BUILDER_STEP_KEYS[Math.min(index, 6)] ?? "overview";
  return (["overview", "format", "registration", "monetization", "media", "rounds", "rounds", "rounds", "review"] as const)[Math.min(index, 8)] ?? "overview";
}

export function tournamentOrderedText(value: unknown): string[] {
  const values = Array.isArray(value) ? value : typeof value === "string" ? value.split(/\r?\n/) : [];
  return values.filter((item): item is string => typeof item === "string").map(item => item.trim()).filter(Boolean);
}

export function tournamentBasePrizeReadiness(requiredCents: number, confirmedCreatorCents: number) {
  const valid = Number.isSafeInteger(requiredCents) && requiredCents >= 0 && (requiredCents === 0 || requiredCents >= 500);
  const confirmed = Number.isSafeInteger(confirmedCreatorCents) && confirmedCreatorCents > 0 ? confirmedCreatorCents : 0;
  const outstandingCents = Math.max(0, requiredCents - confirmed);
  return { valid, outstandingCents, fullyFunded: valid && outstandingCents === 0, fundingRequired: requiredCents > 0 };
}
