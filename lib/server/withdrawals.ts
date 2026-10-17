import type { Firestore, Transaction } from "firebase-admin/firestore";
import { deterministicId } from "@/lib/server/idempotency";
import { createCashWalletDefaults } from "@/lib/server/cash-wallet";
import { WITHDRAWAL_ARCHITECTURE_CONFIG, type WithdrawalRequestStatus } from "@/lib/server/wallet-architecture";

export const MIN_WITHDRAWAL_CENTS = WITHDRAWAL_ARCHITECTURE_CONFIG.minimumWithdrawalAmountCents;
export const WITHDRAWABLE_CASH_SOURCE_TYPES = new Set(["challenge_winner_prize", "sponsor_prize", "prediction_reward", "creator_challenge_earning"]);
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
  const payoutMethodRef = db.collection("payoutMethods").doc(deterministicId("payout_method", input.userId, input.payoutMethodType));
  const sourceRefs = input.sourceIds.map((id) => db.collection("cashLedger").doc(id));
  const [existing, walletSnap, ...sourceSnaps] = await transaction.getAll(requestRef, walletRef, ...sourceRefs);
  if (existing.exists) {
    if (Number(existing.data()?.amountCents) !== input.amountCents || existing.data()?.payoutMethodType !== input.payoutMethodType || JSON.stringify(existing.data()?.sourceIds) !== JSON.stringify(input.sourceIds)) throw new Error("WITHDRAWAL_IDEMPOTENCY_CONFLICT");
    return { request: existing.data(), created: false };
  }
  if (!Number.isSafeInteger(input.amountCents) || input.amountCents < MIN_WITHDRAWAL_CENTS || new Set(input.sourceIds).size !== input.sourceIds.length || input.sourceIds.length > 200) throw new Error("INVALID_WITHDRAWAL_AMOUNT");
  const priorRequests = await transaction.get(db.collection("withdrawalRequests").where("userId", "==", input.userId).limit(1));
  const sourceTotal = sourceSnaps.reduce((sum, snap) => {
    const source = snap.data() ?? {};
    if (!snap.exists || source.userId !== input.userId || source.status !== "available" || source.direction !== "credit" || source.disputeRestricted === true || source.financialRestriction || source.teamEligibilityRestricted === true || !WITHDRAWABLE_CASH_SOURCE_TYPES.has(String(source.sourceType))) {
      throw new Error("WITHDRAWAL_SOURCE_NOT_ELIGIBLE");
    }
    if (String(source.currency ?? "USD").toUpperCase() !== "USD") throw new Error("WITHDRAWAL_SOURCE_NOT_ELIGIBLE");
    const available = Number(source.availableAmountCents ?? source.netAmountCents ?? source.amountCents ?? 0);
    if (!Number.isSafeInteger(available) || available < 0) throw new Error("WITHDRAWAL_SOURCE_NOT_ELIGIBLE");
    return sum + available;
  }, 0);
  if (!sourceSnaps.length || sourceTotal < input.amountCents) throw new Error("WITHDRAWAL_SOURCE_AMOUNT_MISMATCH");
  const settlements = await Promise.all(sourceSnaps.map(source => source.data()?.settlementId ? transaction.get(db.collection("challengeSettlements").doc(String(source.data()?.settlementId))) : Promise.resolve(null)));
  const sourceChallenges = await Promise.all(sourceSnaps.map((source, index) => source.data()?.challengeId ? transaction.get(db.collection(settlements[index]?.data()?.settlementEntityType === "tournament" ? "tournaments" : "challenges").doc(String(source.data()?.challengeId))) : Promise.resolve(null)));
  if (sourceChallenges.some(challenge => challenge?.data()?.settlementRestricted === true || challenge?.data()?.financialHold === true) || settlements.some(settlement => settlement?.data()?.disputeRestricted === true)) throw new Error("WITHDRAWAL_SOURCE_NOT_ELIGIBLE");
  let remaining = input.amountCents;
  const sourceAllocations = sourceSnaps.map(source => {
    const available = Number(source.data()?.availableAmountCents ?? source.data()?.netAmountCents ?? source.data()?.amountCents ?? 0);
    const amountCents = Math.min(remaining, available); remaining -= amountCents;
    return { sourceId: source.id, amountCents };
  }).filter(allocation => allocation.amountCents > 0);

  const defaults = createCashWalletDefaults(input.userId, input.now);
  const wallet: ReturnType<typeof createCashWalletDefaults> & Record<string, unknown> = { ...defaults, ...(walletSnap.data() ?? {}) };
  const available = Number(wallet.availableBalanceCents ?? 0);
  if (input.amountCents > available) throw new Error("INSUFFICIENT_AVAILABLE_BALANCE");

  const after = available - input.amountCents;
  const underReview = Number(wallet.underReviewBalanceCents ?? wallet.lockedBalanceCents ?? 0) + input.amountCents;
  const request = {
    id: requestId,
    userId: input.userId,
    category: "payout",
    amountCents: input.amountCents,
    currency: input.currency,
    sourceType: input.sourceType,
    sourceIds: input.sourceIds,
    sourceAllocations,
    reservationVersion: 2,
    payoutMethodType: input.payoutMethodType,
    payoutMethodLabel: input.payoutMethodLabel,
    payoutMethodLast4: input.payoutMethodLast4,
    payoutProvider: null,
    payoutProviderReference: null,
    providerWebhookStatus: "not_connected",
    status: "pending_review" as WithdrawalStatus,
    adminReviewStatus: "pending_review",
    riskStatus: "pending_review",
    kycStatus: input.kycStatusAtRequest,
    transferEnabled: false,
    payoutExecuted: false,
    feeAmountCents: null,
    providerFeeVerified: false,
    firstWithdrawalSecurityHold: priorRequests.empty && !wallet.firstWithdrawalRequestedAt,
    earliestProcessingAt: new Date(Date.parse(input.now) + (priorRequests.empty && !wallet.firstWithdrawalRequestedAt ? MINIMUM_WITHDRAWAL_PROCESSING_HOURS : 0) * 60 * 60 * 1000).toISOString(),
    requestedBy: input.userId,
    idempotencyKey: input.idempotencyKey,
    immutable: true,
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
    firstWithdrawalRequestedAt: wallet.firstWithdrawalRequestedAt ?? input.now,
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
    const allocation = sourceAllocations.find(item => item.sourceId === sourceRef.id);
    if (!allocation) continue;
    const source = sourceSnaps.find(item => item.id === sourceRef.id)!.data() ?? {};
    const remainingAvailable = Number(source.availableAmountCents ?? source.netAmountCents ?? source.amountCents ?? 0) - allocation.amountCents;
    transaction.set(sourceRef, {
      status: remainingAvailable > 0 ? "available" : "withdrawal_requested",
      availableAmountCents: remainingAvailable,
      reservedAmountCents: Number(source.reservedAmountCents ?? 0) + allocation.amountCents,
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
