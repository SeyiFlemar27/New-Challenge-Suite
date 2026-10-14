import type { Firestore } from "firebase-admin/firestore";
import { normalTimestamp } from "@/lib/server/normal-lifecycle-policy";
export const NORMAL_EARNINGS_CLEARANCE_MS = 72 * 60 * 60_000;
export async function clearNormalChallengeEarnings(db: Firestore, challengeId: string, now = new Date()) {
  const credits = await db.collection("cashLedger").where("challengeId", "==", challengeId).get();
  let cleared = 0;
  for (const credit of credits.docs) {
    const didClear = await db.runTransaction(async transaction => {
      const sourceSnap = await transaction.get(credit.ref);
      const source = sourceSnap.data() ?? {};
      if (!sourceSnap.exists || source.direction !== "credit" || !["pending_review", "pending_hold"].includes(String(source.status)) || !source.userId || source.disputeRestricted === true) return false;
      const walletRef = db.collection("cashWallets").doc(String(source.userId));
      const [challenge, walletSnap, settlement, liabilities] = await Promise.all([transaction.get(db.collection("challenges").doc(challengeId)), transaction.get(walletRef), transaction.get(db.collection("challengeSettlements").doc(String(source.settlementId))), transaction.get(db.collection("refundCases").where("challengeId", "==", challengeId))]);
      const data = challenge.data() ?? {};
      if (data.normalLifecyclePolicyVersion !== 1 || !data.winnersApprovedAt || data.settlementRestricted === true || data.fraudReviewRequired === true || !settlement.exists || settlement.data()?.disputeRestricted === true || liabilities.docs.some(item => !["succeeded", "cancelled", "rejected"].includes(String(item.data().status)))) return false;
      const approved = normalTimestamp(source.createdAt);
      const hold = source.holdUntil ? normalTimestamp(source.holdUntil) : approved + NORMAL_EARNINGS_CLEARANCE_MS;
      if (!Number.isFinite(approved) || !Number.isFinite(hold) || now.getTime() < Math.max(approved + NORMAL_EARNINGS_CLEARANCE_MS, hold)) return false;
      const amount = Number(source.netAmountCents ?? source.amountCents);
      if (!Number.isSafeInteger(amount) || amount <= 0 || !walletSnap.exists) return false;
      const wallet = walletSnap.data() ?? {};
      const bucket = source.balanceBucket === "locked" ? "lockedBalanceCents" : "pendingBalanceCents";
      if (Number(wallet[bucket] ?? 0) < amount) throw new Error("NORMAL_CLEARANCE_BALANCE_RECONCILIATION_REQUIRED");
      const iso = now.toISOString();
      transaction.update(walletRef, { [bucket]: Number(wallet[bucket]) - amount, availableBalanceCents: Number(wallet.availableBalanceCents ?? 0) + amount, updatedAt: iso });
      transaction.update(credit.ref, { status: "available", balanceBucket: "available", availableAmountCents: amount, reservedAmountCents: 0, availableAt: iso, updatedAt: iso });
      transaction.create(db.collection("auditLogs").doc(`normal_clearance_${credit.id}`), { action: "normal.earning_cleared", actorId: "system_normal_lifecycle", userId: source.userId, challengeId, targetId: credit.id, amountCents: amount, before: { status: source.status }, after: { status: "available" }, providerPayoutExecuted: false, createdAt: iso });
      return true;
    });
    if (didClear) cleared++;
  }
  return { cleared };
}
