export const CASH_WALLET_BUCKETS = ["available", "pending", "held", "blocked_kyc", "blocked_review", "withdrawal_requested", "approved_for_manual_payout", "paid_out", "reversed"] as const;
export type CashWalletBucket = typeof CASH_WALLET_BUCKETS[number];

export const WITHDRAWAL_STATUSES = ["draft", "pending_review", "requested", "under_review", "approved", "processing", "paid", "failed", "rejected", "cancelled"] as const;
export type WithdrawalRequestStatus = typeof WITHDRAWAL_STATUSES[number];

export type MoneySourceType =
  | "creator_challenge_revenue"
  | "host_event_revenue"
  | "sponsorship_payout"
  | "creator_sponsorship_deal"
  | "tournament_revenue"
  | "manual_admin_adjustment"
  | "prediction_arena_settlement"
  | "entry_fee"
  | "paid_vote"
  | "sponsor_contribution"
  | "refund"
  | "dispute";

export type LedgerRevenueType = "entry_fee" | "paid_vote" | "sponsor_contribution" | "manual_admin_adjustment" | "prediction_arena_later" | "refund" | "dispute" | "withdrawal";
export type LedgerShareType = "winner_share" | "creator_host_share" | "platform_share" | "sponsor_funded_prize" | "hold" | "reversal" | "withdrawal_debit";

export type CashLedgerEntryShape = {
  id: string;
  userId: string;
  challengeId?: string | null;
  accountType: string;
  sourceType: MoneySourceType | "withdrawal" | "hold" | "adjustment";
  sourceId: string;
  direction: "credit" | "debit";
  amountCents: number;
  currency: string;
  status: "created" | "pending" | "held" | "available" | "blocked_kyc" | "blocked_review" | "under_review" | "withdrawal_requested" | "approved_for_manual_payout" | "processing" | "paid" | "failed" | "rejected" | "reversed" | "adjusted";
  balanceBucket: CashWalletBucket;
  description: string;
  revenueType?: LedgerRevenueType;
  shareType?: LedgerShareType;
  splitPercent?: number | null;
  holdUntil?: string | null;
  metadata: Record<string, unknown>;
  idempotencyKey: string;
  createdBy: string;
  reviewedBy?: string | null;
  providerReference?: string | null;
  createdAt: string;
  updatedAt: string;
};

export type WithdrawalRequestShape = {
  id: string;
  userId: string;
  amountCents: number;
  currency: string;
  status: WithdrawalRequestStatus;
  payoutMethodId: string | null;
  requestedAt: string;
  reviewedAt: string | null;
  processedAt: string | null;
  completedAt: string | null;
  rejectedAt: string | null;
  failureReason: string | null;
  adminNote: string | null;
  provider: string | null;
  providerTransferId: string | null;
  providerStatus: string | null;
  kycStatusAtRequest: string;
  availableBalanceAtRequestCents: number;
  riskFlags: string[];
  createdAt: string;
  updatedAt: string;
};

export const PLATFORM_FEE_CONFIG = {
  predictionArenaPlatformFeePercent: 7,
  creatorChallengePlatformFeePercent: null,
  hostEventPlatformFeePercent: null,
  sponsorshipPlatformFeePercent: null,
  tournamentPlatformFeePercent: null
} as const;

export const WITHDRAWAL_ARCHITECTURE_CONFIG = {
  withdrawalsEnabled: true,
  payoutProviderConfigured: false,
  payoutMethodCollectionEnabled: true,
  adminReviewRequired: true,
  kycRequired: true,
  minimumWithdrawalAmountCents: 5000,
  pendingClearanceDays: 3,
  minimumProcessingHours: 24,
  withdrawalFeeCents: 0
};

export const WALLET_POLICY_COPY = {
  dorocoinNotCash: "DoroCoins are internal platform credits. They cannot be withdrawn or converted to cash.",
  rewardPointsNotCash: "Reward points are not cash and cannot be withdrawn.",
  withdrawalsSetupRequired: "Withdrawals require KYC, payout details, and admin review before manual payout handling."
};

export function isEligibleEarningAccount(accountType: string, hasCashEarnings = false) {
  const normalized = accountType.toLowerCase();
  return ["creator", "host", "enterprise"].includes(normalized) || hasCashEarnings;
}

export function getWithdrawalDisabledReasons(input: {
  accountType: string;
  availableBalanceCents: number;
  kycStatus: string;
  payoutMethodConfigured: boolean;
  riskFlags?: string[];
  hasCashEarnings?: boolean;
}) {
  const reasons: string[] = [];
  if (!WITHDRAWAL_ARCHITECTURE_CONFIG.withdrawalsEnabled) reasons.push("withdrawals_not_configured");
  if (!WITHDRAWAL_ARCHITECTURE_CONFIG.payoutProviderConfigured) reasons.push("payout_provider_not_configured");
  if (!WITHDRAWAL_ARCHITECTURE_CONFIG.payoutMethodCollectionEnabled || !input.payoutMethodConfigured) reasons.push("payout_method_required");
  if (WITHDRAWAL_ARCHITECTURE_CONFIG.kycRequired && input.kycStatus !== "verified") reasons.push("kyc_required");
  if (!isEligibleEarningAccount(input.accountType, input.hasCashEarnings)) reasons.push("not_eligible_for_cash_withdrawals");
  if (input.availableBalanceCents <= 0) reasons.push("insufficient_available_balance");
  if (input.riskFlags?.length) reasons.push("risk_review_required");
  return reasons;
}

export function calculateGrossToNet(input: {
  grossAmountCents: number;
  paymentProcessorFeeCents?: number;
  platformFeeCents?: number;
  reserveCents?: number;
}) {
  const grossAmountCents = Math.max(0, Math.round(input.grossAmountCents));
  const paymentProcessorFeeCents = Math.max(0, Math.round(input.paymentProcessorFeeCents ?? 0));
  const platformFeeCents = Math.max(0, Math.round(input.platformFeeCents ?? 0));
  const reserveCents = Math.max(0, Math.round(input.reserveCents ?? 0));
  return {
    grossAmountCents,
    paymentProcessorFeeCents,
    platformFeeCents,
    reserveCents,
    netDistributableAmountCents: Math.max(0, grossAmountCents - paymentProcessorFeeCents - platformFeeCents - reserveCents)
  };
}
