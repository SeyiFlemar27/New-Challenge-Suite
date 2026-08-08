import type { Firestore } from "firebase-admin/firestore";
import { deterministicId } from "@/lib/server/idempotency";
import { ECONOMY_V1_RULE_VERSION } from "@/lib/server/economy-rules";

export type ChallengeCreditSourceType = "purchase" | "bonus_purchase" | "paid_vote_spend" | "boost_spend" | "featured_profile_spend" | "premium_analytics_spend" | "advertising_space_spend" | "premium_tool_spend" | "live_event_promotion_spend" | "event_ticket_spend" | "digital_merchandise_spend" | "exclusive_badge_spend" | "premium_membership_spend" | "paid_entry_spend" | "sponsor_campaign_promotion_spend" | "transfer_in" | "transfer_out" | "admin_adjustment" | "refund" | "reversal";

export async function applyChallengeCreditTransaction(db: Firestore, input: { userId: string; amount: number; sourceType: ChallengeCreditSourceType; reason: string; createdBy: string; idempotencyKey: string; relatedPaymentId?: string; relatedChallengeId?: string; relatedVoteId?: string; relatedSponsorCampaignId?: string; ruleVersion?: string }) {
  if (!Number.isInteger(input.amount) || input.amount === 0) throw new Error("A non-zero whole Challenge Credit amount is required.");
  const transactionId = deterministicId("challenge_credit", input.userId, input.idempotencyKey);
  return db.runTransaction(async (transaction) => {
    const walletRef = db.collection("challengeCreditWallets").doc(input.userId);
    const ledgerRef = db.collection("challengeCreditTransactions").doc(transactionId);
    const [walletSnap, existing] = await Promise.all([transaction.get(walletRef), transaction.get(ledgerRef)]);
    if (existing.exists) return { id: ledgerRef.id, ...existing.data(), idempotentReplay: true };
    const balanceBefore = Number(walletSnap.data()?.balance ?? 0);
    const balanceAfter = balanceBefore + input.amount;
    if (balanceAfter < 0) throw new Error("Insufficient Challenge Credits.");
    const now = new Date().toISOString();
    transaction.set(walletRef, { userId: input.userId, balance: balanceAfter, withdrawable: false, cashConvertible: false, updatedAt: now }, { merge: true });
    const record = { id: ledgerRef.id, userId: input.userId, amount: Math.abs(input.amount), signedAmount: input.amount, direction: input.amount > 0 ? "credit" : "debit", balanceBefore, balanceAfter, sourceType: input.sourceType, actionType: input.sourceType, reason: input.reason, relatedPaymentId: input.relatedPaymentId ?? null, relatedChallengeId: input.relatedChallengeId ?? null, relatedVoteId: input.relatedVoteId ?? null, relatedSponsorCampaignId: input.relatedSponsorCampaignId ?? null, ruleVersion: input.ruleVersion ?? ECONOMY_V1_RULE_VERSION, status: "confirmed", createdBy: input.createdBy, createdAt: now, auditMetadata: {}, immutable: true, withdrawable: false };
    transaction.create(ledgerRef, record);
    return record;
  });
}

export async function transferChallengeCredits(db: Firestore, input: { senderId: string; receiverId: string; amount: number; idempotencyKey: string; reason?: string; dailyMaximum: number; ruleVersion?: string }) {
  if (input.senderId === input.receiverId) throw new Error("Challenge Credits cannot be transferred to the same account.");
  if (!Number.isInteger(input.amount) || input.amount <= 0) throw new Error("Transfer amount must be a positive whole number.");
  const transferId = deterministicId("challenge_credit_transfer", input.senderId, input.receiverId, input.idempotencyKey);
  const transferDay = new Date().toISOString().slice(0, 10);
  return db.runTransaction(async (transaction) => {
    const transferRef = db.collection("challengeCreditTransfers").doc(transferId);
    const dailyGuardRef = db.collection("challengeCreditTransferDailyGuards").doc(deterministicId(input.senderId, transferDay));
    const [existing, dailyGuard] = await Promise.all([transaction.get(transferRef), transaction.get(dailyGuardRef)]);
    if (existing.exists) return { id: transferRef.id, ...existing.data(), idempotentReplay: true };
    const senderRef = db.collection("challengeCreditWallets").doc(input.senderId);
    const receiverRef = db.collection("challengeCreditWallets").doc(input.receiverId);
    const userRef = db.collection("users").doc(input.receiverId);
    const [sender, receiver, targetUser] = await Promise.all([transaction.get(senderRef), transaction.get(receiverRef), transaction.get(userRef)]);
    if (!targetUser.exists || targetUser.data()?.accountStatus === "disabled") throw new Error("The receiving account is not available.");
    const senderBalance = Number(sender.data()?.balance ?? 0);
    if (senderBalance < input.amount) throw new Error("Insufficient Challenge Credits.");
    const transferredToday = Number(dailyGuard.data()?.amount ?? 0);
    if (transferredToday + input.amount > input.dailyMaximum) throw new Error("Daily Challenge Credit transfer limit reached.");
    const now = new Date().toISOString();
    transaction.set(senderRef, { userId: input.senderId, balance: senderBalance - input.amount, updatedAt: now }, { merge: true });
    transaction.set(receiverRef, { userId: input.receiverId, balance: Number(receiver.data()?.balance ?? 0) + input.amount, withdrawable: false, updatedAt: now }, { merge: true });
    const ruleVersion = input.ruleVersion ?? ECONOMY_V1_RULE_VERSION;
    transaction.set(dailyGuardRef, { userId: input.senderId, transferDay, amount: transferredToday + input.amount, ruleVersion, updatedAt: now }, { merge: true });
    const record = { id: transferId, senderId: input.senderId, receiverId: input.receiverId, amount: input.amount, reason: input.reason ?? null, status: "confirmed", ruleVersion, dailyMaximum: input.dailyMaximum, createdAt: now, immutable: true };
    transaction.create(transferRef, record);
    transaction.create(db.collection("challengeCreditTransactions").doc(`${transferId}_out`), { ...record, id: `${transferId}_out`, userId: input.senderId, signedAmount: -input.amount, direction: "debit", balanceBefore: senderBalance, balanceAfter: senderBalance - input.amount, sourceType: "transfer_out" });
    transaction.create(db.collection("challengeCreditTransactions").doc(`${transferId}_in`), { ...record, id: `${transferId}_in`, userId: input.receiverId, signedAmount: input.amount, direction: "credit", balanceBefore: Number(receiver.data()?.balance ?? 0), balanceAfter: Number(receiver.data()?.balance ?? 0) + input.amount, sourceType: "transfer_in" });
    return record;
  });
}
