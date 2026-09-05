import { FieldValue, type Firestore } from "firebase-admin/firestore";
import { deterministicId } from "@/lib/server/idempotency";
import { rewardEntitlementPayload, type RewardEntitlementType } from "@/lib/server/reward-economy";
import { normalizeRewardPrize } from "@/lib/server/rewards";

const ENTITLEMENT_TYPES = new Set<RewardEntitlementType>(["free_entry", "fixed_entry_discount", "percentage_entry_discount", "creator_boost", "bonus_spin"]);
const SUPPORTED_TYPES = new Set(["reward_points", "dorocoin", "cash", ...ENTITLEMENT_TYPES]);

function amount(value: unknown) {
  const parsed = Math.trunc(Number(value));
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
}

export async function createManualRewardGrant(db: Firestore, input: { userId: string; prizeId: string; adminId: string; reason: string; idempotencyKey: string }) {
  const reason = input.reason.trim().slice(0, 500);
  if (reason.length < 8) throw new Error("MANUAL_GRANT_REASON_REQUIRED");
  const prizeRef = db.collection("rewardPrizes").doc(input.prizeId);
  const prizeSnapshot = await prizeRef.get();
  if (!prizeSnapshot.exists) throw new Error("MANUAL_GRANT_PRIZE_NOT_FOUND");
  const initialPrize = normalizeRewardPrize(prizeSnapshot.id, prizeSnapshot.data() ?? {});
  if (!SUPPORTED_TYPES.has(initialPrize.prizeType)) throw new Error("MANUAL_GRANT_PRIZE_UNSUPPORTED");
  const budgetRef = initialPrize.prizeType === "cash" && initialPrize.budgetId ? db.collection("rewardBudgets").doc(initialPrize.budgetId) : null;
  const grantId = deterministicId("manual_reward_grant", input.userId, input.prizeId, input.idempotencyKey);
  const grantRef = db.collection("rewardGrants").doc(grantId);
  const fulfillmentRef = db.collection("rewardFulfillments").doc(deterministicId("manual_reward_fulfillment", grantId));

  return db.runTransaction(async (transaction) => {
    const [grantSnapshot, currentPrizeSnapshot, userSnapshot, profileSnapshot, budgetSnapshot] = await Promise.all([
      transaction.get(grantRef),
      transaction.get(prizeRef),
      transaction.get(db.collection("users").doc(input.userId)),
      transaction.get(db.collection("profiles").doc(input.userId)),
      budgetRef ? transaction.get(budgetRef) : Promise.resolve(null),
    ]);
    if (grantSnapshot.exists) return { idempotent: true, grant: { id: grantSnapshot.id, ...grantSnapshot.data() } };
    if (!userSnapshot.exists && !profileSnapshot.exists) throw new Error("MANUAL_GRANT_USER_NOT_FOUND");
    if (!currentPrizeSnapshot.exists) throw new Error("MANUAL_GRANT_PRIZE_NOT_FOUND");
    const prize = normalizeRewardPrize(currentPrizeSnapshot.id, currentPrizeSnapshot.data() ?? {});
    if (!SUPPORTED_TYPES.has(prize.prizeType) || !prize.enabled || prize.status !== "active") throw new Error("MANUAL_GRANT_PRIZE_UNAVAILABLE");
    const rewardValue = prize.prizeType === "creator_boost" ? 3 : amount(prize.rewardValue);
    if (!rewardValue) throw new Error("MANUAL_GRANT_PRIZE_VALUE_INVALID");
    if (prize.prizeType === "percentage_entry_discount" && !amount(prize.maximumDiscountCents)) throw new Error("MANUAL_GRANT_DISCOUNT_CAP_REQUIRED");
    if (prize.quantityType === "limited") {
      const remaining = amount(prize.remainingQuantity);
      if (!remaining) throw new Error("MANUAL_GRANT_PRIZE_OUT_OF_STOCK");
      transaction.set(prizeRef, { remainingQuantity: remaining - 1, reservedQuantity: FieldValue.increment(1), updatedAt: new Date().toISOString() }, { merge: true });
    }
    const now = new Date().toISOString();
    const fulfillmentStatus = prize.prizeType === "cash" ? "pending_review" : "fulfilled";
    const grant = { id: grantId, grantId, userId: input.userId, prizeId: prize.id, rewardDefinitionId: prize.id, rewardName: prize.prizeName, rewardNameSnapshot: prize.prizeName, rewardDescription: prize.prizeDescription, rewardType: prize.prizeType, rewardValue, rewardValueSnapshot: rewardValue, unit: prize.prizeType === "creator_boost" ? "days" : prize.unit, currency: prize.currency, imageUrl: prize.imageUrl, sourceType: "admin_manual_grant", sourceId: input.adminId, fulfillmentId: fulfillmentRef.id, fulfillmentStatus, status: "granted", reason, immutable: true, createdByAdminId: input.adminId, createdAt: now, updatedAt: now };
    transaction.create(grantRef, grant);
    transaction.create(fulfillmentRef, { id: fulfillmentRef.id, rewardGrantId: grantId, userId: input.userId, prizeId: prize.id, prizeType: prize.prizeType, status: fulfillmentStatus, attemptCount: prize.prizeType === "cash" ? 0 : 1, externalPayoutExecuted: false, createdAt: now, updatedAt: now });
    transaction.create(db.collection("rewardFulfilments").doc(fulfillmentRef.id), { id: fulfillmentRef.id, rewardGrantId: grantId, userId: input.userId, prizeId: prize.id, prizeType: prize.prizeType, status: fulfillmentStatus, attemptCount: prize.prizeType === "cash" ? 0 : 1, externalPayoutExecuted: false, createdAt: now, updatedAt: now });

    if (prize.prizeType === "reward_points") {
      const ledgerId = deterministicId("manual_reward_points", grantId);
      const ledger = { id: ledgerId, userId: input.userId, direction: "credit", amount: rewardValue, currency: "REWARD_POINTS", sourceType: "admin_manual_reward_grant", sourceId: grantId, sourceEventKey: `manual-reward-grant:${grantId}`, description: reason, immutable: true, withdrawable: false, cashValue: null, createdAt: now };
      transaction.create(db.collection("rewardLedgerEntries").doc(ledgerId), ledger);
      transaction.create(db.collection("rewardAccounts").doc(input.userId).collection("ledger").doc(ledgerId), ledger);
      transaction.set(db.collection("rewardAccounts").doc(input.userId), { userId: input.userId, availablePoints: FieldValue.increment(rewardValue), lifetimeEarned: FieldValue.increment(rewardValue), updatedAt: now }, { merge: true });
      transaction.set(db.collection("userRewards").doc(input.userId), { availableRewardPoints: FieldValue.increment(rewardValue), updatedAt: now }, { merge: true });
      transaction.set(db.collection("users").doc(input.userId), { voterPoints: FieldValue.increment(rewardValue), updatedAt: now }, { merge: true });
    } else if (prize.prizeType === "dorocoin") {
      const transactionRef = db.collection("doroCoinTransactions").doc(deterministicId("manual_reward_dorocoin", grantId));
      transaction.set(db.collection("doroCoinWallets").doc(input.userId), { userId: input.userId, balance: FieldValue.increment(rewardValue), withdrawable: false, updatedAt: now }, { merge: true });
      transaction.create(transactionRef, { id: transactionRef.id, userId: input.userId, amount: rewardValue, signedAmount: rewardValue, direction: "credit", type: "reward", sourceType: "admin_manual_reward_grant", sourceId: grantId, description: reason, immutable: true, withdrawable: false, cashOutEnabled: false, createdAt: now });
    } else if (prize.prizeType === "cash") {
      if (!budgetRef || !budgetSnapshot?.exists || amount(budgetSnapshot.data()?.remainingExposureCents) < rewardValue) throw new Error("MANUAL_GRANT_CASH_BUDGET_INVALID");
      transaction.set(budgetRef, { remainingExposureCents: FieldValue.increment(-rewardValue), reservedExposureCents: FieldValue.increment(rewardValue), updatedAt: now }, { merge: true });
      const cashRef = db.collection("cashLedger").doc(deterministicId("manual_reward_cash", grantId));
      transaction.create(cashRef, { id: cashRef.id, walletCreditId: cashRef.id, userId: input.userId, sourceType: "admin_manual_reward_grant", sourceId: grantId, type: "internal_reward_credit", direction: "credit", grossAmountCents: rewardValue, feeRate: 0, feeAmountCents: 0, netAmountCents: rewardValue, amountCents: rewardValue, currency: "USD", status: "pending_review", balanceBucket: "pending", pendingReviewAt: now, availableAt: null, payoutProviderCalled: false, externalPayoutExecuted: false, paid: false, withdrawn: false, createdBy: input.adminId, createdAt: now, updatedAt: now });
      transaction.set(db.collection("cashWallets").doc(input.userId), { userId: input.userId, status: "review_only", currency: "USD", pendingBalanceCents: FieldValue.increment(rewardValue), lifetimeEarningsCents: FieldValue.increment(rewardValue), withdrawalsEnabled: false, payoutProviderConnected: false, updatedAt: now }, { merge: true });
    } else if (ENTITLEMENT_TYPES.has(prize.prizeType as RewardEntitlementType)) {
      const type = prize.prizeType as RewardEntitlementType;
      const entitlementId = deterministicId("manual_reward_entitlement", grantId, type);
      transaction.create(db.collection("rewardEntitlements").doc(entitlementId), rewardEntitlementPayload({ id: entitlementId, userId: input.userId, type, sourceId: grantId, value: rewardValue, unit: type === "creator_boost" ? "days" : prize.unit ?? undefined, tier: type === "bonus_spin" ? prize.prizeTier : undefined, maximumFeeCents: type === "free_entry" ? rewardValue : type === "percentage_entry_discount" ? prize.maximumDiscountCents : null, expiresAt: prize.entitlementExpiresAt, metadata: { grantedByAdminId: input.adminId }, now }));
    }
    const auditRef = db.collection("rewardAuditLogs").doc(deterministicId("manual_reward_grant_audit", grantId));
    transaction.create(auditRef, { id: auditRef.id, action: "admin_manual_reward_grant_created", adminId: input.adminId, userId: input.userId, prizeId: prize.id, rewardGrantId: grantId, fulfillmentId: fulfillmentRef.id, reason, createdAt: now });
    return { idempotent: false, grant };
  });
}
