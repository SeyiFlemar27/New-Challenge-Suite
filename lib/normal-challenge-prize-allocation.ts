const NORMAL_WINNER_PERCENTAGES: Record<1 | 3, readonly number[]> = {
  1: [100],
  3: [60, 25, 15]
};

export function calculateNormalWinnerAmountsCents(totalCents: number, winnerCount: number) {
  if (!Number.isSafeInteger(totalCents) || totalCents < 0 || (winnerCount !== 1 && winnerCount !== 3)) return [];
  const percentages = NORMAL_WINNER_PERCENTAGES[winnerCount];
  let allocated = 0;
  return percentages.map((percent, index) => {
    const amount = index === percentages.length - 1 ? totalCents - allocated : Math.floor(totalCents * percent / 100);
    allocated += amount;
    return amount;
  });
}

export function normalWinnerPercentages(winnerCount: number) {
  return winnerCount === 1 || winnerCount === 3 ? [...NORMAL_WINNER_PERCENTAGES[winnerCount]] : [];
}

export function normalWinnerDistribution(winnerCount: number) {
  return normalWinnerPercentages(winnerCount).map((percent, index) => ({ position: index + 1, percent }));
}

export function normalQualifiedWinnerDistribution(configuredCount: number, qualifiedCount: number) {
  if (![1, 3].includes(configuredCount) || !Number.isInteger(qualifiedCount) || qualifiedCount < 1 || qualifiedCount > configuredCount) return [];
  const weights = normalWinnerPercentages(configuredCount).slice(0, qualifiedCount);
  const denominator = weights.reduce((sum, value) => sum + value, 0);
  let allocatedPercent = 0;
  return weights.map((weight, index) => {
    const percent = index === weights.length - 1 ? 100 - allocatedPercent : weight * 100 / denominator;
    allocatedPercent += percent;
    return { position: index + 1, percent };
  });
}

export function allocateNormalQualifiedPrizeCents(totalCents: number, configuredCount: number, qualifiedCount: number) {
  const distribution = normalQualifiedWinnerDistribution(configuredCount, qualifiedCount);
  if (!Number.isSafeInteger(totalCents) || totalCents < 0 || !distribution.length) return [];
  const weights = normalWinnerPercentages(configuredCount).slice(0, qualifiedCount);
  const denominator = BigInt(weights.reduce((sum, value) => sum + value, 0));
  let allocated = 0;
  return distribution.map((item, index) => {
    const amountCents = index === distribution.length - 1 ? totalCents - allocated : Number(BigInt(totalCents) * BigInt(weights[index]) / denominator);
    allocated += amountCents;
    return { ...item, amountCents };
  });
}
