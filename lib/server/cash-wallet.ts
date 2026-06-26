import type { Firestore } from "firebase-admin/firestore";
import type { CashTransactionStatus, CashTransactionType } from "@/lib/server/cash-transactions";

export type CashWalletStatus = "inactive" | "review_only" | "locked";
export type { CashTransactionStatus, CashTransactionType };

export type CashWalletSnapshot = {
  userId: string;
  status: CashWalletStatus;
  availableBalanceCents: number;
  pendingBalanceCents: number;
  lockedBalanceCents: number;
  currency: string;
  withdrawalsEnabled: false;
  payoutProviderConnected: false;
  updatedAt: string;
};

export function createCashWalletDefaults(userId: string, now = new Date().toISOString()): CashWalletSnapshot {
  return {
    userId,
    status: "review_only",
    availableBalanceCents: 0,
    pendingBalanceCents: 0,
    lockedBalanceCents: 0,
    currency: "USD",
    withdrawalsEnabled: false,
    payoutProviderConnected: false,
    updatedAt: now
  };
}

export async function ensureCashWalletFoundation(db: Firestore, userId: string) {
  const walletRef = db.collection("cashWallets").doc(userId);
  const snap = await walletRef.get();
  if (!snap.exists) {
    await walletRef.set(createCashWalletDefaults(userId));
  }
  return walletRef;
}

export function normalizeCashWallet(userId: string, data: FirebaseFirestore.DocumentData | undefined): CashWalletSnapshot {
  const defaults = createCashWalletDefaults(userId);
  return {
    ...defaults,
    ...data,
    userId,
    status: ["inactive", "review_only", "locked"].includes(String(data?.status)) ? data?.status : defaults.status,
    availableBalanceCents: Number(data?.availableBalanceCents ?? 0),
    pendingBalanceCents: Number(data?.pendingBalanceCents ?? 0),
    lockedBalanceCents: Number(data?.lockedBalanceCents ?? 0),
    currency: String(data?.currency ?? defaults.currency),
    withdrawalsEnabled: false,
    payoutProviderConnected: false,
    updatedAt: String(data?.updatedAt ?? defaults.updatedAt)
  };
}
