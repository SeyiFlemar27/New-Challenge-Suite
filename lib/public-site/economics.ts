export const PUBLIC_ECONOMY_V1_SPLIT = { winners: 0.65, platform: 0.15, creator: 0.1, hostSponsor: 0.1 } as const;

export type CalculatorInput = {
  type: "paid" | "free" | "sponsored" | "tournament" | "live_event";
  entryFee: number;
  participants: number;
  creatorStartingPrize: number;
  sponsorStartingPrize: number;
  additionalProjectedRevenue: number;
  winners: number;
  currency: "USD";
};

const money = (value: number) => Math.max(0, Math.round(value * 100) / 100);

function payoutPercentages(winners: number) {
  if (winners <= 1) return [1];
  if (winners === 2) return [0.7, 0.3];
  return [0.5, 0.3, 0.2];
}

export function calculateChallengeEconomics(input: CalculatorInput) {
  const winnerCount = Math.max(1, Math.min(3, Math.round(input.winners || 1)));
  const entryRevenue = ["paid", "tournament", "live_event"].includes(input.type) ? money(input.entryFee * input.participants) : 0;
  const additionalProjectedRevenue = money(input.additionalProjectedRevenue);
  const totalGeneratedRevenue = money(entryRevenue + additionalProjectedRevenue);
  const winnerJackpotFromRevenue = money(totalGeneratedRevenue * PUBLIC_ECONOMY_V1_SPLIT.winners);
  const platformShare = money(totalGeneratedRevenue * PUBLIC_ECONOMY_V1_SPLIT.platform);
  const creatorShare = money(totalGeneratedRevenue * PUBLIC_ECONOMY_V1_SPLIT.creator);
  const hostSponsorShare = money(totalGeneratedRevenue * PUBLIC_ECONOMY_V1_SPLIT.hostSponsor);
  const creatorStartingPrize = money(input.creatorStartingPrize);
  const sponsorStartingPrize = money(input.sponsorStartingPrize);
  const startingPrizePool = money(creatorStartingPrize + sponsorStartingPrize);
  const totalWinnerPayoutPool = money(startingPrizePool + winnerJackpotFromRevenue);
  const winnerPayouts = payoutPercentages(winnerCount).map((percent, index) => ({ place: index + 1, percent, amount: money(totalWinnerPayoutPool * percent) }));
  return {
    entryRevenue,
    additionalProjectedRevenue,
    totalGeneratedRevenue,
    winnerJackpotFromRevenue,
    platformShare,
    creatorShare,
    hostSponsorShare,
    creatorStartingPrize,
    sponsorStartingPrize,
    startingPrizePool,
    totalWinnerPayoutPool,
    winnerPayouts,
    winners: winnerCount,
    currency: "USD" as const,
    guaranteed: false,
    processingFeeNote: "This is an estimate. Actual payouts depend on confirmed payments, challenge rules, sponsor eligibility, winner approval, dispute review, and final settlement."
  };
}
