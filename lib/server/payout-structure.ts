import { getChallengeLifecycleState, normalizeChallengeDate } from "@/lib/challenge-status";
import { getUserPlanAccess } from "@/lib/plan-access";
import { WITHDRAWAL_ARCHITECTURE_CONFIG, type CashWalletBucket } from "@/lib/server/wallet-architecture";

export const DEFAULT_CASH_CURRENCY = "USD";
export const MINIMUM_ENTRY_FEE_CENTS = 500;
export const CASH_EARNING_HOLD_HOURS = 24;

export const PAID_REVENUE_SPLIT = {
  winnerSharePercent: 65,
  creatorHostOperatorSharePercent: 20,
  platformAdminSharePercent: 15
} as const;

export const SPONSOR_CONTRIBUTION_SPLIT = {
  winnerSharePercent: 100,
  creatorHostOperatorSharePercent: 0,
  platformAdminSharePercent: 0,
  futureSponsorServiceFeePercent: null as number | null
} as const;

export const DEFAULT_WINNER_SPLITS = {
  single: [{ position: 1, percent: 100 }],
  topThree: [{ position: 1, percent: 70 }, { position: 2, percent: 20 }, { position: 3, percent: 10 }]
} as const;

export const SPONSOR_BRAND_PLACEMENTS = [
  "challenge_detail",
  "voting_page",
  "leaderboard",
  "winner_announcement",
  "share_card"
] as const;

export type RevenueType = "entry_fee" | "paid_vote" | "sponsor_contribution" | "manual_admin_adjustment" | "prediction_arena_later" | "refund" | "dispute" | "withdrawal";
export type ShareType = "winner_share" | "creator_host_share" | "platform_share" | "sponsor_funded_prize" | "hold" | "reversal" | "withdrawal_debit";

function cents(value: number) {
  return Math.max(0, Math.round(Number(value) || 0));
}

export function validateEntryFee(entryFeeCents: number) {
  const safeEntryFeeCents = cents(entryFeeCents);
  return {
    valid: safeEntryFeeCents >= MINIMUM_ENTRY_FEE_CENTS,
    minimumEntryFeeCents: MINIMUM_ENTRY_FEE_CENTS,
    entryFeeCents: safeEntryFeeCents,
    currency: DEFAULT_CASH_CURRENCY,
    message: safeEntryFeeCents >= MINIMUM_ENTRY_FEE_CENTS ? "Entry fee is valid." : "Entry fee must be at least $5."
  };
}

export function getChallengeMonetizationAccess(profile: Record<string, unknown> = {}) {
  const access = getUserPlanAccess(profile);
  const enterpriseApproved = access.isEnterprise && String(profile.enterpriseAccessStatus ?? profile.enterpriseApprovalStatus ?? "").toLowerCase() === "approved";
  const earningAccount = access.isCreator || access.isHost || enterpriseApproved;
  const lockedReason = access.normalizedPlanId === "free"
    ? "Free users can create basic non-monetized public challenges only."
    : access.isEnterprise && !enterpriseApproved
      ? "Enterprise monetization requires admin-approved Enterprise access."
      : "Monetization remains setup-safe until payment, KYC, admin review, and payout foundations are active.";
  return {
    accountType: access.accountType,
    planId: access.normalizedPlanId,
    enterpriseApproved,
    canPreparePaidEntry: earningAccount,
    canPrepareSponsorReady: earningAccount,
    canPreparePrizePool: earningAccount,
    canPreparePaidVotes: earningAccount,
    paidEntryPaymentActive: false,
    paidVotePaymentActive: false,
    prizePoolReleaseActive: false,
    sponsorFundingPaymentActive: false,
    lockedReason
  };
}

export function calculatePaidRevenueSplit(grossAmountCents: number, revenueType: Extract<RevenueType, "entry_fee" | "paid_vote"> = "entry_fee") {
  const gross = cents(grossAmountCents);
  const winnerShareCents = Math.floor(gross * PAID_REVENUE_SPLIT.winnerSharePercent / 100);
  const creatorHostOperatorShareCents = Math.floor(gross * PAID_REVENUE_SPLIT.creatorHostOperatorSharePercent / 100);
  const platformAdminShareCents = gross - winnerShareCents - creatorHostOperatorShareCents;
  return {
    revenueType,
    grossAmountCents: gross,
    currency: DEFAULT_CASH_CURRENCY,
    winnerShareCents,
    creatorHostOperatorShareCents,
    platformAdminShareCents,
    split: PAID_REVENUE_SPLIT,
    platformShareTiming: "after_provider_payment_confirmation",
    winnerShareStatus: "pending_winner_admin_approval",
    creatorHostOperatorShareStatus: "pending_24_hour_hold",
    reversalPathwayRequired: true,
    ledgerRequired: true,
    moneyMovementEnabled: false
  };
}

export function calculateChallengeRevenueSplitPreview(input: {
  confirmedEntryFeeRevenueCents?: number;
  confirmedPaidVoteRevenueCents?: number;
  confirmedBoostRevenueCents?: number;
  confirmedSponsorContributionCents?: number;
}) {
  const confirmedEntryFeeRevenueCents = cents(input.confirmedEntryFeeRevenueCents ?? 0);
  const confirmedPaidVoteRevenueCents = cents(input.confirmedPaidVoteRevenueCents ?? 0);
  const confirmedBoostRevenueCents = cents(input.confirmedBoostRevenueCents ?? 0);
  const confirmedSponsorContributionCents = cents(input.confirmedSponsorContributionCents ?? 0);
  const generatedRevenueCents = confirmedEntryFeeRevenueCents + confirmedPaidVoteRevenueCents + confirmedBoostRevenueCents;
  const platformFeeCents = Math.floor(generatedRevenueCents * PAID_REVENUE_SPLIT.platformAdminSharePercent / 100);
  return {
    currency: DEFAULT_CASH_CURRENCY,
    generatedRevenueCents,
    confirmedEntryFeeRevenueCents,
    confirmedPaidVoteRevenueCents,
    confirmedBoostRevenueCents,
    confirmedSponsorContributionCents,
    platformFeePercent: PAID_REVENUE_SPLIT.platformAdminSharePercent,
    platformFeeCents,
    netGeneratedRevenueCents: generatedRevenueCents - platformFeeCents,
    sponsorContributionPlatformFeeCents: 0,
    sponsorFundsExcludedFromPlatformFee: true,
    sponsorContributionWinnerShareCents: confirmedSponsorContributionCents,
    distributionStatus: "foundation_only_pending_admin_ledger_finalization",
    noPayoutExecution: true,
    noFakePrizePool: true
  };
}

export function calculateSponsorContributionSplit(contributionCents: number) {
  const gross = cents(contributionCents);
  return {
    revenueType: "sponsor_contribution" as const,
    grossAmountCents: gross,
    currency: DEFAULT_CASH_CURRENCY,
    winnerShareCents: gross,
    creatorHostOperatorShareCents: 0,
    platformAdminShareCents: 0,
    split: SPONSOR_CONTRIBUTION_SPLIT,
    paymentConfirmationRequired: true,
    sponsorContributionStatus: "awaiting_provider_confirmation",
    ledgerRequired: true,
    moneyMovementEnabled: false
  };
}

export function calculateWinnerPrizePool(input: {
  entryFeeWinnerShareCents?: number;
  paidVoteWinnerShareCents?: number;
  sponsorContributionWinnerShareCents?: number;
  approvedManualPrizeFundsCents?: number;
}) {
  const entryFeeRevenueWinnerShareCents = cents(input.entryFeeWinnerShareCents ?? 0);
  const paidVoteRevenueWinnerShareCents = cents(input.paidVoteWinnerShareCents ?? 0);
  const sponsorContributionWinnerShareCents = cents(input.sponsorContributionWinnerShareCents ?? 0);
  const approvedManualPrizeFundsCents = cents(input.approvedManualPrizeFundsCents ?? 0);
  return {
    entryFeeRevenueWinnerShareCents,
    paidVoteRevenueWinnerShareCents,
    sponsorContributionWinnerShareCents,
    approvedManualPrizeFundsCents,
    winnerPrizePoolCents: entryFeeRevenueWinnerShareCents + paidVoteRevenueWinnerShareCents + sponsorContributionWinnerShareCents + approvedManualPrizeFundsCents,
    sponsorContributionExcludedFromCreatorPlatformSplit: true,
    adminApprovalRequired: true,
    ledgerRequired: true,
    moneyMovementEnabled: false
  };
}

export function calculateWinnerDistribution(prizePoolCents: number, splits: Array<{ position: number; percent: number }> = DEFAULT_WINNER_SPLITS.single.map((item) => ({ ...item }))) {
  const totalPercent = splits.reduce((sum, split) => sum + Number(split.percent || 0), 0);
  const valid = splits.length > 0 && totalPercent === 100 && splits.every((split) => split.position > 0 && split.percent >= 0);
  const pool = cents(prizePoolCents);
  return {
    valid,
    totalPercent,
    adminApprovalRequired: true,
    holdHours: CASH_EARNING_HOLD_HOURS,
    distributions: valid ? splits.map((split, index) => {
      const allocatedCents = index === splits.length - 1
        ? pool - splits.slice(0, index).reduce((sum, previous) => sum + Math.floor(pool * previous.percent / 100), 0)
        : Math.floor(pool * split.percent / 100);
      return { position: split.position, percent: split.percent, allocatedCents, status: "pending_admin_approval" };
    }) : []
  };
}

export function holdUntilFromApproval(approvedAt: string | Date, holdHours = CASH_EARNING_HOLD_HOURS) {
  const approved = approvedAt instanceof Date ? approvedAt : new Date(approvedAt);
  if (Number.isNaN(approved.getTime())) return null;
  return new Date(approved.getTime() + holdHours * 60 * 60 * 1000).toISOString();
}

export function validateSponsorFundingWindow(challenge: Record<string, unknown>, now = new Date()) {
  const lifecycle = getChallengeLifecycleState(challenge, now);
  const status = String(challenge.status ?? challenge.lifecycleStatus ?? "").toLowerCase();
  const votingClosesAt = normalizeChallengeDate(challenge.votingDeadline ?? challenge.votingEndsAt, "end");
  const published = Boolean(challenge.publishedAt) || ["published", "scheduled", "registration_not_open", "registration_open", "active", "submission_open", "voting_open"].includes(status);
  const terminal = ["cancelled", "paused", "completed", "winners_announced"].includes(status) || Boolean(challenge.winnersApprovedAt || challenge.adminWinnersApprovedAt);
  const votingClosed = votingClosesAt ? now.getTime() > votingClosesAt.getTime() : lifecycle.votingStatus === "voting_closed";
  const sponsorReady = Boolean(challenge.sponsorEnabled || challenge.sponsorReady);
  const allowed = sponsorReady && published && !terminal && !votingClosed;
  return {
    allowed,
    sponsorReady,
    published,
    votingClosed,
    terminal,
    lifecycleStatus: lifecycle.primaryStatus,
    closesAt: votingClosesAt?.toISOString() ?? null,
    reason: allowed ? "sponsor_funding_open" : !sponsorReady ? "challenge_not_sponsor_ready" : !published ? "challenge_not_published" : terminal ? "challenge_terminal_or_winners_approved" : "voting_closed"
  };
}

export function sponsorPlacementFoundation() {
  return SPONSOR_BRAND_PLACEMENTS.map((surface) => ({
    surface,
    enabledAfterConfirmedPayment: true,
    approvalRequired: true,
    analyticsEnabled: false,
    fakeAnalyticsAllowed: false
  }));
}

export function sponsorshipDiscussionFoundation(challengeId: string, sponsorId: string) {
  return {
    challengeId,
    sponsorId,
    status: "pending_discussion",
    messagingEnabled: false,
    proposalIntentOnly: true,
    fakeMessageSent: false
  };
}

export function ledgerEntryFoundation(input: {
  id: string;
  userId: string;
  challengeId?: string | null;
  sourceType: RevenueType;
  sourceId: string;
  direction: "credit" | "debit";
  amountCents: number;
  revenueType: RevenueType;
  shareType: ShareType;
  splitPercent?: number | null;
  balanceBucket?: CashWalletBucket;
  createdBy: string;
  now?: string;
}) {
  const now = input.now ?? new Date().toISOString();
  return {
    id: input.id,
    userId: input.userId,
    challengeId: input.challengeId ?? null,
    sourceType: input.sourceType,
    sourceId: input.sourceId,
    direction: input.direction,
    amountCents: cents(input.amountCents),
    currency: DEFAULT_CASH_CURRENCY,
    status: "pending",
    balanceBucket: input.balanceBucket ?? "pending",
    revenueType: input.revenueType,
    shareType: input.shareType,
    splitPercent: input.splitPercent ?? null,
    holdUntil: null,
    idempotencyKey: input.id,
    metadata: {},
    createdBy: input.createdBy,
    reviewedBy: null,
    providerReference: null,
    createdAt: now,
    updatedAt: now
  };
}

export function validateWithdrawalEligibility(input: { availableBalanceCents: number; amountCents: number; kycStatus: string; payoutMethodConfigured: boolean; riskFlags?: string[] }) {
  const reasons: string[] = [];
  if (WITHDRAWAL_ARCHITECTURE_CONFIG.kycRequired && input.kycStatus !== "verified") reasons.push("kyc_required");
  if (!WITHDRAWAL_ARCHITECTURE_CONFIG.withdrawalsEnabled) reasons.push("withdrawals_not_configured");
  if (!WITHDRAWAL_ARCHITECTURE_CONFIG.payoutProviderConfigured) reasons.push("payout_provider_not_configured");
  if (!input.payoutMethodConfigured) reasons.push("payout_method_required");
  if (input.amountCents <= 0 || input.availableBalanceCents < input.amountCents) reasons.push("insufficient_available_balance");
  if (input.riskFlags?.length) reasons.push("risk_review_required");
  return { allowed: reasons.length === 0, reasons, createsProviderPayout: false, marksPaidAutomatically: false };
}
