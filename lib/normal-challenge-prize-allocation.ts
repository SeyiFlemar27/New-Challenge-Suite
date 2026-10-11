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
