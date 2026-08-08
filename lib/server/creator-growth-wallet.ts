import type { Firestore } from "firebase-admin/firestore";
import { deterministicId } from "@/lib/server/idempotency";
import { ECONOMY_V1_RULE_VERSION } from "@/lib/server/economy-rules";

export type GrowthWalletSourceType = "creator_earning_allocation" | "admin_credit" | "admin_debit" | "promotional_credit" | "sponsor_growth_campaign" | "spend_boost" | "spend_ads" | "spend_featured_placement" | "spend_creator_collaboration" | "spend_community_campaign" | "spend_live_event_marketing" | "spend_audience_development" | "expiry" | "reversal";

export async function applyGrowthWalletTransaction(db: Firestore, input: { userId: string; amountCents: number; sourceType: GrowthWalletSourceType; reason: string; createdBy: string; idempotencyKey: string; expiresAt?: string | null; relatedChallengeId?: string; relatedSponsorCampaignId?: string }) {
  if (!Number.isInteger(input.amountCents) || input.amountCents === 0) throw new Error("A non-zero whole-cent Growth Wallet amount is required.");
  const id = deterministicId("growth_wallet", input.userId, input.idempotencyKey);
  const allocationCandidates = input.amountCents < 0
    ? (await db.collection("creatorGrowthWalletAllocations").where("userId", "==", input.userId).limit(200).get()).docs
      .filter((doc) => doc.data().status === "active" && Number(doc.data().remainingAmountCents ?? 0) > 0)
      .sort((left, right) => String(left.data().expiresAt ?? "9999").localeCompare(String(right.data().expiresAt ?? "9999")))
    : [];
  return db.runTransaction(async (transaction) => {
    const walletRef = db.collection("creatorGrowthWallets").doc(input.userId);
    const ledgerRef = db.collection("creatorGrowthWalletTransactions").doc(id);
    const [wallet, existing, ...allocations] = await Promise.all([transaction.get(walletRef), transaction.get(ledgerRef), ...allocationCandidates.map((doc) => transaction.get(doc.ref))]);
    if (existing.exists) return { id, ...existing.data(), idempotentReplay: true };
    const balanceBeforeCents = Number(wallet.data()?.balanceCents ?? 0);
    const balanceAfterCents = balanceBeforeCents + input.amountCents;
    if (balanceAfterCents < 0) throw new Error("Insufficient Creator Growth Wallet balance.");
    const now = new Date().toISOString();
    transaction.set(walletRef, { userId: input.userId, balanceCents: balanceAfterCents, withdrawable: false, restrictedUseOnly: true, updatedAt: now }, { merge: true });
    const record = { id, userId: input.userId, amountCents: Math.abs(input.amountCents), signedAmountCents: input.amountCents, direction: input.amountCents > 0 ? "credit" : "debit", balanceBeforeCents, balanceAfterCents, sourceType: input.sourceType, reason: input.reason, relatedChallengeId: input.relatedChallengeId ?? null, relatedSponsorCampaignId: input.relatedSponsorCampaignId ?? null, ruleVersion: ECONOMY_V1_RULE_VERSION, status: "confirmed", withdrawable: false, expiresAt: input.expiresAt ?? null, createdBy: input.createdBy, createdAt: now, immutable: true };
    transaction.create(ledgerRef, record);
    if (input.amountCents > 0 && input.expiresAt) {
      transaction.create(db.collection("creatorGrowthWalletAllocations").doc(id), { id, userId: input.userId, sourceTransactionId: id, sourceType: input.sourceType, originalAmountCents: input.amountCents, remainingAmountCents: input.amountCents, expiresAt: input.expiresAt, status: "active", ruleVersion: ECONOMY_V1_RULE_VERSION, createdAt: now, updatedAt: now });
    }
    if (input.amountCents < 0) {
      let remainingSpend = Math.abs(input.amountCents);
      for (const allocation of allocations) {
        if (!allocation.exists || allocation.data()?.status !== "active" || remainingSpend <= 0) continue;
        const available = Number(allocation.data()?.remainingAmountCents ?? 0);
        const consumed = Math.min(available, remainingSpend);
        if (consumed <= 0) continue;
        const next = available - consumed;
        transaction.set(allocation.ref, { remainingAmountCents: next, status: next === 0 ? "spent" : "active", lastSpendTransactionId: id, updatedAt: now }, { merge: true });
        remainingSpend -= consumed;
      }
    }
    return record;
  });
}
