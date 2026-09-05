export const REWARD_WHEEL_PROBABILITY_UNITS = 1_000_000;

export type RewardWheelTier = "basic" | "standard" | "premium";

export const REWARD_WHEEL_POINT_COSTS: Record<RewardWheelTier, number> = {
  basic: 100,
  standard: 250,
  premium: 500,
};

export type RewardWheelProbabilityEntry = {
  prizeId: string;
  probabilityUnits: number;
};

export type PublicRewardWheelEntry = RewardWheelProbabilityEntry & {
  displayName: string;
  shortLabel: string;
  prizeType: string;
  exactProbability: number;
  imageUrl?: string | null;
  fulfillmentSummary?: string | null;
};

export type PublicRewardWheelConfig = {
  tier: RewardWheelTier;
  versionId: string;
  pointCost: number;
  entries: PublicRewardWheelEntry[];
};

export type RewardWheelStaleVersionResponse = {
  code: "WHEEL_VERSION_CHANGED";
  currentVersionId: string;
};

export function probabilityUnitsFromRelativeWeights(entries: Array<{ prizeId: string; weight: number }>): RewardWheelProbabilityEntry[] {
  const valid = entries.filter((entry) => entry.prizeId && Number.isFinite(entry.weight) && entry.weight > 0);
  const total = valid.reduce((sum, entry) => sum + entry.weight, 0);
  if (!valid.length || total <= 0) return [];

  const allocated = valid.map((entry, index) => {
    const exact = entry.weight / total * REWARD_WHEEL_PROBABILITY_UNITS;
    const units = Math.floor(exact);
    return { prizeId: entry.prizeId, probabilityUnits: units, remainder: exact - units, index };
  });
  let remaining = REWARD_WHEEL_PROBABILITY_UNITS - allocated.reduce((sum, entry) => sum + entry.probabilityUnits, 0);
  const remainderOrder = [...allocated].sort((a, b) => b.remainder - a.remainder || a.index - b.index);
  for (let index = 0; index < remaining; index += 1) remainderOrder[index % remainderOrder.length].probabilityUnits += 1;
  return allocated.map(({ prizeId, probabilityUnits }) => ({ prizeId, probabilityUnits }));
}

export function distributeProbabilityUnits(prizeIds: string[]): RewardWheelProbabilityEntry[] {
  if (!prizeIds.length) return [];
  const base = Math.floor(REWARD_WHEEL_PROBABILITY_UNITS / prizeIds.length);
  const remainder = REWARD_WHEEL_PROBABILITY_UNITS - base * prizeIds.length;
  return prizeIds.map((prizeId, index) => ({ prizeId, probabilityUnits: base + (index < remainder ? 1 : 0) }));
}

export function probabilityPercent(units: number) {
  return units / REWARD_WHEEL_PROBABILITY_UNITS * 100;
}

export function probabilityUnitsFromPercent(percent: number) {
  return Math.round(percent / 100 * REWARD_WHEEL_PROBABILITY_UNITS);
}
