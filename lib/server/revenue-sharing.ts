import { PLATFORM_FEE_CONFIG, calculateGrossToNet } from "@/lib/server/wallet-architecture";
import { PAID_REVENUE_SPLIT, calculatePaidRevenueSplit, calculateSponsorContributionSplit } from "@/lib/server/payout-structure";

export const GENERATED_REVENUE_SPLIT = {
  winnersPercent: PAID_REVENUE_SPLIT.winnerSharePercent,
  hostPercent: PAID_REVENUE_SPLIT.creatorHostOperatorSharePercent,
  sponsorPercent: 0,
  platformPercent: PAID_REVENUE_SPLIT.platformAdminSharePercent
};

export const CHALLENGER_VOTE_REVENUE_BONUS_PERCENT = 10;
export const PREDICTION_PLATFORM_FEE_PERCENT = PLATFORM_FEE_CONFIG.predictionArenaPlatformFeePercent;

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

export function predictionStakeFoundation(stakeAmountUsd: number) {
  const safeStake = Math.max(0, Math.round(stakeAmountUsd * 100) / 100);
  const platformFeeUsd = Math.round(safeStake * PREDICTION_PLATFORM_FEE_PERCENT) / 100;
  return {
    stakeAmountUsd: safeStake,
    platformFeePercent: PREDICTION_PLATFORM_FEE_PERCENT,
    platformFeeUsd,
    netStakeUsd: Math.max(0, Math.round((safeStake - platformFeeUsd) * 100) / 100)
  };
}

export function revenueGrossToNetFoundation(input: { grossAmountCents: number; paymentProcessorFeeCents?: number; platformFeeCents?: number; reserveCents?: number }) {
  return {
    ...calculateGrossToNet(input),
    status: "pending_admin_review",
    moneyMovementEnabled: false,
    feeConfig: PLATFORM_FEE_CONFIG
  };
}

export function paidEntryRevenueFoundation(grossAmountCents: number) {
  return calculatePaidRevenueSplit(grossAmountCents, "entry_fee");
}

export function paidVoteRevenueFoundation(grossAmountCents: number) {
  return calculatePaidRevenueSplit(grossAmountCents, "paid_vote");
}

export function sponsorContributionRevenueFoundation(contributionCents: number) {
  return calculateSponsorContributionSplit(contributionCents);
}

export const VOTER_REWARD_TIERS = [
  { id: "basic", label: "Basic", pointsRequired: 100, spinCredits: 1, spinTier: "basic" },
  { id: "standard", label: "Standard", pointsRequired: 250, spinCredits: 1, spinTier: "standard" },
  { id: "premium", label: "Premium", pointsRequired: 500, spinCredits: 1, spinTier: "premium" }
];
