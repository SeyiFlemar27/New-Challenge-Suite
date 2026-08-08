export const DOROCOINS_PER_USD = 100;
export const MIN_CUSTOM_DOROCOIN_USD = 1;
export const MAX_CUSTOM_DOROCOIN_USD = 200;

export function quoteCustomDoroCoinPurchase(rawAmountUsd: number) {
  if (!Number.isFinite(rawAmountUsd)) return null;
  const roundedInputUsd = Math.round(rawAmountUsd * 100) / 100;
  if (roundedInputUsd < MIN_CUSTOM_DOROCOIN_USD || roundedInputUsd > MAX_CUSTOM_DOROCOIN_USD) return null;
  const coins = Math.round(roundedInputUsd * DOROCOINS_PER_USD);
  const amountUsd = Number((coins / DOROCOINS_PER_USD).toFixed(2));
  return { amountUsd, coins, bonusCoins: 0, totalCoins: coins };
}
