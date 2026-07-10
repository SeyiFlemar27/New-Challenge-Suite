import type { Firestore } from "firebase-admin/firestore";
import { deterministicId } from "@/lib/server/idempotency";
import { VOTER_REWARD_TIERS } from "@/lib/server/revenue-sharing";

export type RewardSpinTier = "basic" | "standard" | "premium";

export function emptySpinCredits() {
  return { basic: 0, standard: 0, premium: 0 } as Record<RewardSpinTier, number>;
}

export function normalizeSpinCredits(value: unknown) {
  const base = emptySpinCredits();
  if (value && typeof value === "object") {
    const record = value as Record<string, unknown>;
    base.basic = Number(record.basic ?? 0);
    base.standard = Number(record.standard ?? 0);
    base.premium = Number(record.premium ?? 0);
  } else if (typeof value === "number") {
    base.basic = Math.max(0, Math.floor(value));
  }
  return base;
}

export async function awardDoroCoinPurchaseRewards(db: Firestore, input: { userId: string; coins: number; sourceId: string; eventId: string }) {
  const pointsAwarded = Math.max(0, Math.floor(input.coins));
  if (!pointsAwarded) return { pointsAwarded: 0, spinCreditsAwarded: emptySpinCredits(), rewardEventId: null };
  const now = new Date().toISOString();
  const userRef = db.collection("users").doc(input.userId);
  const rewardEventId = deterministicId("dorocoin_purchase_reward", input.sourceId, input.eventId, input.userId);
  const rewardEventRef = db.collection("voterRewardEvents").doc(rewardEventId);
  const result = await db.runTransaction(async (transaction) => {
    const existing = await transaction.get(rewardEventRef);
    if (existing.exists) return { duplicate: true, pointsAwarded: 0, spinCreditsAwarded: emptySpinCredits() };
    const userSnap = await transaction.get(userRef);
    const profile = userSnap.data() ?? {};
    const currentPoints = Number(profile.voterPoints ?? 0);
    const nextPoints = currentPoints + pointsAwarded;
    const achieved = profile.rewardTierMilestones as Record<string, boolean> | undefined ?? {};
    const rewardTierMilestones = { ...achieved };
    const currentCredits = normalizeSpinCredits(profile.rewardSpinCreditsByTier ?? profile.rewardSpinCredits);
    const spinCreditsAwarded = emptySpinCredits();
    for (const tier of VOTER_REWARD_TIERS) {
      if (!rewardTierMilestones[tier.id] && currentPoints < tier.pointsRequired && nextPoints >= tier.pointsRequired) {
        rewardTierMilestones[tier.id] = true;
        spinCreditsAwarded[tier.spinTier as RewardSpinTier] += tier.spinCredits;
        currentCredits[tier.spinTier as RewardSpinTier] += tier.spinCredits;
      }
    }
    const totalCredits = currentCredits.basic + currentCredits.standard + currentCredits.premium;
    transaction.set(userRef, {
      voterPoints: nextPoints,
      rewardSpinCredits: totalCredits,
      rewardSpinCreditsByTier: currentCredits,
      rewardTierMilestones,
      updatedAt: now
    }, { merge: true });
    transaction.create(rewardEventRef, {
      id: rewardEventId,
      userId: input.userId,
      sourceType: "dorocoin_purchase",
      sourceId: input.sourceId,
      stripeEventId: input.eventId,
      pointsAwarded,
      spinCreditsAwarded,
      status: "recorded_after_server_confirmed_purchase",
      cashOutEnabled: false,
      createdAt: now
    });
    return { duplicate: false, pointsAwarded, spinCreditsAwarded };
  });
  return { ...result, rewardEventId };
}
