import type { Firestore } from "firebase-admin/firestore";
import { ensureCashWalletFoundation } from "@/lib/server/cash-wallet";

export type CashTransactionType =
  | "prize_placeholder_created"
  | "sponsor_contribution_requested"
  | "payout_review_created"
  | "refund_review_created"
  | "dispute_opened"
  | "manual_adjustment_placeholder"
  | "voided_placeholder";

export type CashTransactionStatus = "pending_review" | "recorded" | "voided" | "blocked";
export type CashTransactionDirection = "none" | "credit_placeholder" | "debit_placeholder";
export type CashTransactionSourceType = "challenge" | "sponsorship" | "winner_claim" | "payout" | "refund" | "dispute" | "manual_review";

export type CashTransactionFoundation = {
  id: string;
  userId: string;
  walletId: string;
  type: CashTransactionType;
  status: CashTransactionStatus;
  amountCents: number;
  currency: string;
  direction: CashTransactionDirection;
  sourceType: CashTransactionSourceType;
  sourceId: string;
  challengeId: string | null;
  submissionId: string | null;
  winnerClaimId: string | null;
  payoutId: string | null;
  refundId: string | null;
  disputeId: string | null;
  description: string;
  balanceImpact: "none";
  withdrawableImpact: "none";
  providerConnected: false;
  transferEnabled: false;
  createdAt: string;
  updatedAt: string;
};

export function createCashTransactionPlaceholder(input: {
  id: string;
  userId: string;
  walletId?: string;
  type: CashTransactionType;
  status?: CashTransactionStatus;
  amountCents?: number;
  currency?: string;
  direction?: CashTransactionDirection;
  sourceType: CashTransactionSourceType;
  sourceId: string;
  challengeId?: string | null;
  submissionId?: string | null;
  winnerClaimId?: string | null;
  payoutId?: string | null;
  refundId?: string | null;
  disputeId?: string | null;
  description: string;
  now?: string;
}): CashTransactionFoundation {
  const now = input.now ?? new Date().toISOString();
  const amountCents = Math.max(0, Math.trunc(Number(input.amountCents ?? 0)));
  return {
    id: input.id,
    userId: input.userId,
    walletId: input.walletId ?? input.userId,
    type: input.type,
    status: input.status ?? "pending_review",
    amountCents,
    currency: input.currency ?? "USD",
    direction: input.direction ?? "none",
    sourceType: input.sourceType,
    sourceId: input.sourceId,
    challengeId: input.challengeId ?? null,
    submissionId: input.submissionId ?? null,
    winnerClaimId: input.winnerClaimId ?? null,
    payoutId: input.payoutId ?? null,
    refundId: input.refundId ?? null,
    disputeId: input.disputeId ?? null,
    description: input.description,
    balanceImpact: "none",
    withdrawableImpact: "none",
    providerConnected: false,
    transferEnabled: false,
    createdAt: now,
    updatedAt: now
  };
}

export async function writeCashTransactionPlaceholder(db: Firestore, input: Omit<Parameters<typeof createCashTransactionPlaceholder>[0], "id"> & { id?: string }) {
  await ensureCashWalletFoundation(db, input.userId);
  const ref = input.id ? db.collection("cashTransactions").doc(input.id) : db.collection("cashTransactions").doc();
  const record = createCashTransactionPlaceholder({ ...input, id: ref.id });
  await ref.set(record, { merge: false });
  return record;
}

export function areCashTransfersEnabled() {
  return false;
}
