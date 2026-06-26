import type { Firestore } from "firebase-admin/firestore";

export type DoroTransactionType = "purchase" | "admin_grant" | "vote_spend" | "boost_spend" | "reward" | "adjustment";

export async function ensureWallet(db: Firestore, userId: string) {
  const walletRef = db.collection("doroCoinWallets").doc(userId);
  const snap = await walletRef.get();
  if (!snap.exists) {
    await walletRef.set({ userId, balance: 0, lockedBalance: 0, updatedAt: new Date().toISOString() });
  }
  return walletRef;
}

export async function applyDoroCoinTransaction(
  db: Firestore,
  input: {
    userId: string;
    amount: number;
    type: DoroTransactionType;
    description: string;
    createdBy: string;
    sourceId?: string;
    transactionId?: string;
    idempotencyKey?: string;
  }
) {
  if (!Number.isFinite(input.amount) || input.amount === 0) throw new Error("A non-zero DoroCoin amount is required.");

  return db.runTransaction(async (transaction) => {
    const walletRef = db.collection("doroCoinWallets").doc(input.userId);
    const txnRef = input.transactionId || input.idempotencyKey
      ? db.collection("doroCoinTransactions").doc(input.transactionId ?? input.idempotencyKey!)
      : db.collection("doroCoinTransactions").doc();

    if (input.transactionId || input.idempotencyKey) {
      const existingTxn = await transaction.get(txnRef);
      if (existingTxn.exists) return { id: txnRef.id, ...existingTxn.data(), idempotentReplay: true };
    }

    const walletSnap = await transaction.get(walletRef);
    const currentBalance = walletSnap.exists ? Number(walletSnap.data()?.balance ?? 0) : 0;
    const nextBalance = currentBalance + input.amount;
    if (nextBalance < 0) throw new Error("Insufficient DoroCoin balance.");

    const now = new Date().toISOString();
    transaction.set(walletRef, {
      userId: input.userId,
      balance: nextBalance,
      lockedBalance: walletSnap.exists ? Number(walletSnap.data()?.lockedBalance ?? 0) : 0,
      updatedAt: now
    }, { merge: true });

    const record = {
      id: txnRef.id,
      userId: input.userId,
      amount: input.amount,
      balanceAfter: nextBalance,
      type: input.type,
      description: input.description,
      sourceId: input.sourceId ?? null,
      idempotencyKey: input.idempotencyKey ?? input.transactionId ?? null,
      createdBy: input.createdBy,
      createdAt: now
    };
    transaction.set(txnRef, record);
    return record;
  });
}

export const doroCoinPackages = {
  doro_50: { coins: 50, price: 1.99, stripePriceEnv: "STRIPE_PRICE_DOROCOIN_50" },
  doro_100: { coins: 100, price: 7.99, stripePriceEnv: "STRIPE_PRICE_DOROCOIN_100" },
  doro_500: { coins: 500, price: 19.99, stripePriceEnv: "STRIPE_PRICE_DOROCOIN_500" }
};