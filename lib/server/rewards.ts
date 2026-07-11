import type { Firestore } from "firebase-admin/firestore";
import { deterministicId } from "@/lib/server/idempotency";
import { VOTER_REWARD_TIERS } from "@/lib/server/revenue-sharing";

export type RewardSpinTier = "basic" | "standard" | "premium";
export type RewardPrize = {
  id: string;
  prizeName: string;
  prizeDescription: string;
  prizeTier: RewardSpinTier;
  prizeType: string;
  probabilityWeight: number;
  quantity?: number | null;
  enabled: boolean;
  manualFulfillmentRequired: boolean;
  fulfillmentInstructions?: string | null;
  status?: string;
  expiresAt?: string | null;
  imageUrl?: string | null;
  cashOutEnabled?: false;
};

export function emptySpinCredits() {
  return { basic: 0, standard: 0, premium: 0 } as Record<RewardSpinTier, number>;
}

export function normalizeSpinCredits(value: unknown) {
  const base = emptySpinCredits();
  if (value && typeof value === "object") {
    const record = value as Record<string, unknown>;
    base.basic = Math.max(0, Math.floor(Number(record.basic ?? 0)));
    base.standard = Math.max(0, Math.floor(Number(record.standard ?? 0)));
    base.premium = Math.max(0, Math.floor(Number(record.premium ?? 0)));
  } else if (typeof value === "number") {
    base.basic = Math.max(0, Math.floor(value));
  }
  return base;
}

export const DEFAULT_REWARD_PRIZES: RewardPrize[] = [
  { id: "default-basic-dorocoin", prizeName: "Small DoroCoin Bonus", prizeDescription: "A small platform-credit bonus, applied only when the reward worker is enabled.", prizeTier: "basic", prizeType: "dorocoin_bonus", probabilityWeight: 20, quantity: null, enabled: true, manualFulfillmentRequired: false, status: "foundation", cashOutEnabled: false },
  { id: "default-basic-free-vote", prizeName: "1 Free Vote", prizeDescription: "One bonus vote credit after server-side reward application is connected.", prizeTier: "basic", prizeType: "free_vote", probabilityWeight: 25, quantity: null, enabled: true, manualFulfillmentRequired: false, status: "foundation", cashOutEnabled: false },
  { id: "default-basic-badge", prizeName: "Basic Badge", prizeDescription: "A profile badge foundation for low-risk rewards.", prizeTier: "basic", prizeType: "badge", probabilityWeight: 20, quantity: null, enabled: true, manualFulfillmentRequired: false, status: "foundation", cashOutEnabled: false },
  { id: "default-basic-discount", prizeName: "Small Discount", prizeDescription: "A future discount foundation that requires admin/provider setup.", prizeTier: "basic", prizeType: "discount", probabilityWeight: 15, quantity: null, enabled: true, manualFulfillmentRequired: true, status: "foundation", cashOutEnabled: false },
  { id: "default-basic-try-again", prizeName: "Try Again", prizeDescription: "No prize this time. Spin history is still recorded.", prizeTier: "basic", prizeType: "try_again", probabilityWeight: 20, quantity: null, enabled: true, manualFulfillmentRequired: false, status: "foundation", cashOutEnabled: false },
  { id: "default-standard-dorocoin", prizeName: "Larger DoroCoin Bonus", prizeDescription: "A larger platform-credit bonus foundation.", prizeTier: "standard", prizeType: "dorocoin_bonus", probabilityWeight: 22, quantity: null, enabled: true, manualFulfillmentRequired: false, status: "foundation", cashOutEnabled: false },
  { id: "default-standard-votes", prizeName: "Multiple Free Votes", prizeDescription: "Multiple bonus vote credits after reward application is connected.", prizeTier: "standard", prizeType: "free_vote", probabilityWeight: 22, quantity: null, enabled: true, manualFulfillmentRequired: false, status: "foundation", cashOutEnabled: false },
  { id: "default-standard-highlight", prizeName: "Profile Highlight", prizeDescription: "Profile highlight requires admin review before activation.", prizeTier: "standard", prizeType: "profile_highlight", probabilityWeight: 18, quantity: null, enabled: true, manualFulfillmentRequired: true, status: "foundation", cashOutEnabled: false },
  { id: "default-standard-coupon", prizeName: "Sponsor Coupon", prizeDescription: "Sponsor coupon fulfillment is manual/provider-backed.", prizeTier: "standard", prizeType: "sponsor_coupon", probabilityWeight: 18, quantity: null, enabled: true, manualFulfillmentRequired: true, status: "foundation", cashOutEnabled: false },
  { id: "default-standard-discount", prizeName: "Challenge Entry Discount", prizeDescription: "Entry discount foundation. Paid entry remains disabled unless activated later.", prizeTier: "standard", prizeType: "discount", probabilityWeight: 20, quantity: null, enabled: true, manualFulfillmentRequired: true, status: "foundation", cashOutEnabled: false },
  { id: "default-premium-dorocoin", prizeName: "Bigger DoroCoin Bonus", prizeDescription: "Highest DoroCoin bonus foundation. DoroCoins are not cash.", prizeTier: "premium", prizeType: "dorocoin_bonus", probabilityWeight: 20, quantity: null, enabled: true, manualFulfillmentRequired: false, status: "foundation", cashOutEnabled: false },
  { id: "default-premium-badge", prizeName: "Premium Badge", prizeDescription: "Premium badge foundation.", prizeTier: "premium", prizeType: "badge", probabilityWeight: 20, quantity: null, enabled: true, manualFulfillmentRequired: false, status: "foundation", cashOutEnabled: false },
  { id: "default-premium-ticket", prizeName: "Event Ticket", prizeDescription: "Manual event-ticket fulfillment by the Challenge Suite team.", prizeTier: "premium", prizeType: "event_ticket", probabilityWeight: 15, quantity: null, enabled: true, manualFulfillmentRequired: true, status: "foundation", cashOutEnabled: false },
  { id: "default-premium-merch", prizeName: "Merch/Product Prize", prizeDescription: "Manual physical or partner prize fulfillment.", prizeTier: "premium", prizeType: "merch", probabilityWeight: 20, quantity: null, enabled: true, manualFulfillmentRequired: true, status: "foundation", cashOutEnabled: false },
  { id: "default-premium-gift", prizeName: "Gift Card / Manual Prize", prizeDescription: "Manual fulfillment only. No cash-out prize is enabled by default.", prizeTier: "premium", prizeType: "gift_card", probabilityWeight: 25, quantity: null, enabled: true, manualFulfillmentRequired: true, status: "foundation", cashOutEnabled: false }
];

export function normalizeRewardPrize(id: string, data: Record<string, unknown>): RewardPrize {
  const tier = String(data.prizeTier ?? data.tier ?? "basic") as RewardSpinTier;
  return {
    id,
    prizeName: String(data.prizeName ?? data.name ?? "Reward"),
    prizeDescription: String(data.prizeDescription ?? data.description ?? "Reward foundation"),
    prizeTier: ["basic", "standard", "premium"].includes(tier) ? tier : "basic",
    prizeType: String(data.prizeType ?? "manual_prize"),
    probabilityWeight: Math.max(0, Number(data.probabilityWeight ?? data.weight ?? 1)),
    quantity: data.quantity === undefined || data.quantity === null ? null : Number(data.quantity),
    enabled: data.enabled !== false,
    manualFulfillmentRequired: data.manualFulfillmentRequired !== false || ["merch", "gift_card", "event_ticket", "manual_prize", "sponsor_coupon", "profile_highlight", "discount"].includes(String(data.prizeType ?? "")),
    fulfillmentInstructions: typeof data.fulfillmentInstructions === "string" ? data.fulfillmentInstructions : null,
    status: String(data.status ?? "active"),
    expiresAt: typeof data.expiresAt === "string" ? data.expiresAt : null,
    imageUrl: typeof data.imageUrl === "string" ? data.imageUrl : null,
    cashOutEnabled: false
  };
}

export function availablePrizesForTier(prizes: RewardPrize[], tier: RewardSpinTier, now = Date.now()) {
  return prizes.filter((prize) => {
    const expired = prize.expiresAt ? Date.parse(prize.expiresAt) < now : false;
    const outOfInventory = prize.quantity !== null && prize.quantity !== undefined && Number(prize.quantity) <= 0;
    return prize.enabled && prize.prizeTier === tier && prize.probabilityWeight > 0 && !expired && !outOfInventory;
  });
}

export function chooseRewardPrize(prizes: RewardPrize[], tier: RewardSpinTier) {
  const available = availablePrizesForTier(prizes, tier);
  if (!available.length) return null;
  const totalWeight = available.reduce((sum, prize) => sum + prize.probabilityWeight, 0);
  let cursor = Math.random() * totalWeight;
  for (const prize of available) {
    cursor -= prize.probabilityWeight;
    if (cursor <= 0) return prize;
  }
  return available[available.length - 1];
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
