import type { SupportedFinancialCurrency } from "@/lib/server/financial/money";

export type FinancialEnvironmentMode = "production" | "staging" | "development" | "sandbox";
export type FinancialAccountStatus = "active" | "restricted" | "suspended" | "closed";
export type LedgerBucket = "available" | "pending" | "reserved" | "paidOut" | "negativeBalance";
export type FinancialTransactionStatus = "draft" | "pending" | "posted" | "reversed" | "voided";
export type ProviderEventStatus = "received" | "processed" | "ignored_duplicate" | "failed";
export type PayoutMethodStatus = "not_configured" | "pending_verification" | "verified" | "restricted";
export type SandboxKycStatus = "approved" | "pending" | "rejected" | "requires_resubmission" | "manual_review" | "expired";

export type FinancialAccountFoundation = {
  id: string;
  userId: string;
  status: FinancialAccountStatus;
  currencies: SupportedFinancialCurrency[];
  withdrawalEligibility: "eligible" | "blocked";
  kycStatus: string;
  payoutStatus: PayoutMethodStatus;
  createdAt: string;
  updatedAt: string;
};

export type FinancialLedgerEntryFoundation = {
  id: string;
  accountId: string;
  userId: string | null;
  direction: "debit" | "credit";
  amountMinor: number;
  currency: SupportedFinancialCurrency;
  bucket: LedgerBucket;
  status: "pending_hold" | "posted" | "reserved" | "reversed";
  transactionId: string;
  sourceType: "challenge_prize" | "paid_vote_participant_share" | "creator_share" | "sponsor_funding" | "platform_fee" | "refund" | "chargeback" | "payout" | "adjustment" | "prediction_arena" | "prediction_reward" | "prediction_platform_fee";
  sourceId: string;
  idempotencyKey: string;
  holdUntil: string | null;
  immutable: true;
  createdAt: string;
  createdBy: string;
  providerReference: string | null;
  metadata: Record<string, unknown>;
};

export type FinancialTransactionFoundation = {
  id: string;
  status: FinancialTransactionStatus;
  transactionType: "settlement" | "funding" | "payout" | "refund" | "chargeback" | "adjustment" | "provider_event";
  entries: FinancialLedgerEntryFoundation[];
  idempotencyKey: string;
  reversalOfTransactionId: string | null;
  createdAt: string;
  updatedAt: string;
};

export type ProviderEventFoundation = {
  id: string;
  provider: "stripe" | "sandbox" | "future_payout_provider";
  providerEventId: string;
  paymentPurpose: string | null;
  status: ProviderEventStatus;
  idempotencyKey: string;
  payloadStoredSafely: true;
  rawSecretStored: false;
  createdAt: string;
  processedAt: string | null;
};

export type PayoutMethodFoundation = {
  id: string;
  userId: string;
  provider: "sandbox" | "future_provider";
  currency: SupportedFinancialCurrency;
  status: PayoutMethodStatus;
  maskedAccount: string | null;
  tokenizedProviderReference: string | null;
  rawBankDetailsStored: false;
  createdAt: string;
  updatedAt: string;
};
