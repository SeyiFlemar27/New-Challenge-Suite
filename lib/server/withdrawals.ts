import type { Firestore, Transaction } from "firebase-admin/firestore";
import { deterministicId } from "@/lib/server/idempotency";
import { createCashWalletDefaults } from "@/lib/server/cash-wallet";
import { WITHDRAWAL_ARCHITECTURE_CONFIG, type WithdrawalRequestStatus } from "@/lib/server/wallet-architecture";

export const MIN_WITHDRAWAL_CENTS = WITHDRAWAL_ARCHITECTURE_CONFIG.minimumWithdrawalAmountCents;
export const MAX_DAILY_WITHDRAWAL_CENTS = null as number | null;
export const MINIMUM_WITHDRAWAL_PROCESSING_HOURS = WITHDRAWAL_ARCHITECTURE_CONFIG.minimumProcessingHours;

export type WithdrawalStatus =
  | "draft"
  | "pending_review"
  | "requested"
  | "under_review"
  | "needs_kyc"
  | "approved"
  | "processing"
  | "paid"
  | "failed"
  | "rejected"
  | "cancelled"
  | "reversed";

export type PlannedWithdrawalStatus = WithdrawalRequestStatus;

export function maskAccount(accountNumber: string) {
  const digits = accountNumber.replace(/\D/g, "");
  return digits ? `â€¢â€¢â€¢â€¢ ${digits.slice(-4).padStart(4, "â€¢")}` : "Not provided";
}

export function createWithdrawalLedgerRecord(input: {
  id: string;
  userId: string;
  withdrawalId: string;
  amountCents: number;
  currency: string;
  balanceBeforeCents: number;
  balanceAfterCents: number;
  now: string;
}) {
  return {
    ledgerId: input.id,
    userId: input.userId,
    type: "withdrawal_requested",
    sourceType: "withdrawal",
    sourceId: input.withdrawalId,
    amountCents: input.amountCents,
    currency: input.currency,
    direction: "debit_lock",
    balanceBeforeCents: input.balanceBeforeCents,
    balanceAfterCents: input.balanceAfterCents,
    status: "pending_review",
    providerConnected: false,
    transferEnabled: false,
    metadata: { reviewOnly: true },
    createdAt: input.now
  };
}

export async function createWithdrawalRequest(
  db: Firestore,
  transaction: Transaction,
  input: {
    userId: string;
    amountCents: number;
    currency: string;
    sourceType: string;
    sourceIds: string[];
    payoutMethodType: string;
    payoutMethodLabel: string;
    payoutMethodLast4: string;
    accountHolderName: string;
    bankName: string;
    country: string;
    kycStatusAtRequest: string;
    idempotencyKey: string;
    now: string;
  }
) {
  const requestId = deterministicId("withdrawal", input.userId, input.idempotencyKey);
  const requestRef = db.collection("withdrawalRequests").doc(requestId);
  const walletRef = db.collection("cashWallets").doc(input.userId);
  const payoutMethodRef = db.collection("payoutMethods").doc(deterministicId(input.userId, input.payoutMethodType));
  const sourceRefs = input.sourceIds.map((id) => db.collection("cashLedger").doc(id));
  const [existing, walletSnap, ...sourceSnaps] = await Promise.all([
    transaction.get(requestRef),
    transaction.get(walletRef),
    ...sourceRefs.map((ref) => transaction.get(ref))
  ]);
  if (existing.exists) return { request: existing.data(), created: false };
  const sourceTotal = sourceSnaps.reduce((sum, snap) => {
    const source = snap.data() ?? {};
    if (!snap.exists || source.userId !== input.userId || source.status !== "available" || source.direction !== "credit") {
      throw new Error("WITHDRAWAL_SOURCE_NOT_ELIGIBLE");
    }
    return sum + Number(source.netAmountCents ?? source.amountCents ?? 0);
  }, 0);
  if (!sourceSnaps.length || sourceTotal !== input.amountCents) throw new Error("WITHDRAWAL_SOURCE_AMOUNT_MISMATCH");

  const defaults = createCashWalletDefaults(input.userId, input.now);
  const wallet = { ...defaults, ...(walletSnap.data() ?? {}) };
  const available = Number(wallet.availableBalanceCents ?? 0);
  if (input.amountCents > available) throw new Error("INSUFFICIENT_AVAILABLE_BALANCE");

  const after = available - input.amountCents;
  const underReview = Number(wallet.underReviewBalanceCents ?? wallet.lockedBalanceCents ?? 0) + input.amountCents;
  const request = {
    id: requestId,
    userId: input.userId,
    amountCents: input.amountCents,
    currency: input.currency,
    sourceType: input.sourceType,
    sourceIds: input.sourceIds,
    payoutMethodType: input.payoutMethodType,
    payoutMethodLabel: input.payoutMethodLabel,
    payoutMethodLast4: input.payoutMethodLast4,
    payoutProvider: "manual",
    payoutProviderReference: null,
    providerWebhookStatus: "not_connected",
    status: "pending_review" as WithdrawalStatus,
    adminReviewStatus: "pending_review",
    riskStatus: "pending_review",
    kycStatus: input.kycStatusAtRequest,
    transferEnabled: false,
    payoutExecuted: false,
    feeAmountCents: 0,
    earliestProcessingAt: new Date(Date.parse(input.now) + MINIMUM_WITHDRAWAL_PROCESSING_HOURS * 60 * 60 * 1000).toISOString(),
    requestedBy: input.userId,
    idempotencyKey: input.idempotencyKey,
    createdAt: input.now,
    updatedAt: input.now
  };
  const ledgerId = deterministicId(requestId, "requested");
  transaction.set(walletRef, {
    ...wallet,
    availableBalanceCents: after,
    underReviewBalanceCents: underReview,
    lockedBalanceCents: underReview,
    status: "review_only",
    withdrawalsEnabled: false,
    payoutProviderConnected: false,
    updatedAt: input.now
  }, { merge: true });
  transaction.set(payoutMethodRef, {
    id: payoutMethodRef.id,
    userId: input.userId,
    type: input.payoutMethodType,
    accountHolderName: input.accountHolderName,
    bankName: input.bankName,
    maskedAccount: input.payoutMethodLabel,
    last4: input.payoutMethodLast4,
    country: input.country,
    currency: input.currency,
    payoutProvider: "manual",
    payoutProviderReference: null,
    verificationStatus: "not_started",
    providerConnected: false,
    transferEnabled: false,
    updatedAt: input.now,
    createdAt: input.now
  }, { merge: true });
  for (const sourceRef of sourceRefs) {
    transaction.set(sourceRef, {
      status: "withdrawal_requested",
      withdrawalRequestId: requestId,
      updatedAt: input.now
    }, { merge: true });
  }
  transaction.create(requestRef, request);
  transaction.create(db.collection("cashLedger").doc(ledgerId), createWithdrawalLedgerRecord({
    id: ledgerId,
    userId: input.userId,
    withdrawalId: requestId,
    amountCents: input.amountCents,
    currency: input.currency,
    balanceBeforeCents: available,
    balanceAfterCents: after,
    now: input.now
  }));
  return { request, created: true };
}

export function payoutProviders() {
  return ["manual", "stripe_connect", "paystack_transfers", "flutterwave_transfers"] as const;
}

export function automaticPayoutsEnabled() {
  return false;
}
