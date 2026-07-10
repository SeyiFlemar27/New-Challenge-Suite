export const GENERATED_REVENUE_SPLIT = {
  winnersPercent: 65,
  hostPercent: 15,
  sponsorPercent: 10,
  platformPercent: 10
};

export const CHALLENGER_VOTE_REVENUE_BONUS_PERCENT = 10;

export function calculateGeneratedRevenueSplit(generatedRevenueCents: number) {
  const safeRevenue = Math.max(0, Math.round(generatedRevenueCents));
  const winnersShareCents = Math.round(safeRevenue * GENERATED_REVENUE_SPLIT.winnersPercent / 100);
  const hostShareCents = Math.round(safeRevenue * GENERATED_REVENUE_SPLIT.hostPercent / 100);
  const sponsorShareCents = Math.round(safeRevenue * GENERATED_REVENUE_SPLIT.sponsorPercent / 100);
  const platformShareCents = safeRevenue - winnersShareCents - hostShareCents - sponsorShareCents;
  return {
    generatedRevenueCents: safeRevenue,
    winnersShareCents,
    hostShareCents,
    sponsorShareCents,
    platformShareCents,
    split: GENERATED_REVENUE_SPLIT,
    releaseStatus: "pending_admin_review",
    moneyMovementEnabled: false
  };
}

export function calculateChallengerVoteRevenueBonus(voteRevenueCents: number) {
  const safeRevenue = Math.max(0, Math.round(voteRevenueCents));
  return {
    voteRevenueCents: safeRevenue,
    challengerVoteRevenueBonusCents: Math.round(safeRevenue * CHALLENGER_VOTE_REVENUE_BONUS_PERCENT / 100),
    bonusPercent: CHALLENGER_VOTE_REVENUE_BONUS_PERCENT,
    status: "pending_admin_review",
    moneyMovementEnabled: false
  };
}

export function revenueShareFoundation(input: { challengeId: string; creatorId: string; sponsorEnabled: boolean; now: string }) {
  return {
    id: `revenue_share_${input.challengeId}`,
    challengeId: input.challengeId,
    creatorId: input.creatorId,
    initialPrizePoolCents: 0,
    initialPrizePoolRule: "100_percent_to_winners_after_admin_review",
    ...calculateGeneratedRevenueSplit(0),
    challengerVoteRevenueBonus: calculateChallengerVoteRevenueBonus(0),
    sponsorEnabled: input.sponsorEnabled,
    pendingRelease: true,
    availableForReview: false,
    released: false,
    disputed: false,
    refunded: false,
    canceled: false,
    status: "foundation",
    adminReviewRequired: true,
    createdAt: input.now,
    updatedAt: input.now
  };
}

export function predictionFee(stakeAmountDorocoin: number) {
  const safeStake = Math.max(0, Math.floor(stakeAmountDorocoin));
  const platformFeeDorocoin = Math.floor(safeStake * 0.07);
  return {
    stakeAmountDorocoin: safeStake,
    platformFeeDorocoin,
    netPoolDorocoin: Math.max(0, safeStake - platformFeeDorocoin)
  };
}

export const VOTER_REWARD_TIERS = [
  { id: "basic", label: "Basic", pointsRequired: 100, spinCredits: 1, spinTier: "basic" },
  { id: "standard", label: "Standard", pointsRequired: 250, spinCredits: 1, spinTier: "standard" },
  { id: "premium", label: "Premium", pointsRequired: 500, spinCredits: 1, spinTier: "premium" }
];

