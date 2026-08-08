import type { Firestore } from "firebase-admin/firestore";

export const ECONOMY_V1_RULE_VERSION = "economy_v1_2026_08";

export const ECONOMY_V1_RULES = {
  version: ECONOMY_V1_RULE_VERSION,
  status: "active",
  doroCoin: {
    coinsPerUsd: 100,
    rewards: {
      daily_login: 10,
      watch_challenge_video: 2,
      like_challenge: 1,
      comment_challenge: 3,
      share_challenge: 5,
      referral_signup: 50,
      create_free_challenge: 25,
      join_free_challenge: 20,
      win_free_challenge: 150,
      top_10_finish: 75,
      profile_verification: 100,
      sponsored_ad_watch: 5
    },
    caps: { videoPerDay: 20, likesPerDay: 50, commentsPerDay: 20, sharesPerDay: 10, sponsoredAdMax: 10 },
    transfer: { minimum: 10, maximum: 10_000, dailyMaximum: 25_000 },
    streaks: {
      7: { coins: 250, badge: null },
      30: { coins: 2_000, badge: null },
      90: { coins: 5_000, badge: "exclusive_streak_90" },
      365: { coins: 25_000, badge: "legendary_streak_365" }
    },
    cashConvertible: false,
    withdrawable: false,
    canBuyVotes: false
  },
  challengeCredits: {
    creditsPerUsd: 100,
    packages: [
      { id: "credits_500", priceCents: 500, credits: 500 },
      { id: "credits_1050", priceCents: 1_000, credits: 1_050 },
      { id: "credits_2700", priceCents: 2_500, credits: 2_700 },
      { id: "credits_5600", priceCents: 5_000, credits: 5_600 },
      { id: "credits_11500", priceCents: 10_000, credits: 11_500 }
    ],
    transfer: { minimum: 100, maximum: 25_000, dailyMaximum: 50_000 },
    refundableReasons: ["duplicate_payment", "failed_delivery", "provider_error", "admin_approved"],
    withdrawable: false,
    predictionArenaEligible: false
  },
  voting: { freeVotesPerChallengePerLocalDay: 1, paidVoteCostCredits: 10, paidVoteDailyLimit: 10, paidVotingEnabled: true },
  paidEntry: { winnerPercent: 65, platformPercent: 15, creatorPercent: 10, hostSponsorPercent: 10 },
  growthWallet: { defaultAllocationPercent: 10, minimumAllocationPercent: 0, maximumAllocationPercent: 30, expiryMonths: 12, withdrawable: false },
  creatorLevels: [
    { id: "rookie", name: "Rookie Creator", minimumScore: 0, benefits: ["standard_creator_tools"] },
    { id: "rising_star", name: "Rising Star", minimumScore: 100, benefits: ["standard_creator_tools", "growth_insights"] },
    { id: "verified", name: "Verified Creator", minimumScore: 250, requiresVerification: true, benefits: ["verified_creator_badge", "sponsor_discovery_eligibility"] },
    { id: "pro", name: "Pro Creator", minimumScore: 500, benefits: ["advanced_creator_analytics", "growth_wallet_allocation"] },
    { id: "elite", name: "Elite Creator", minimumScore: 1_000, benefits: ["featured_placement_eligibility", "creator_collaboration_tools"] },
    { id: "hall_of_fame", name: "Hall of Fame Creator", minimumScore: 2_500, benefits: ["priority_creator_review", "hall_of_fame_recognition"] }
  ]
} as const;

export type EconomyRules = typeof ECONOMY_V1_RULES;

export async function getActiveEconomyRules(db?: Firestore | null): Promise<EconomyRules> {
  if (!db) return ECONOMY_V1_RULES;
  const active = await db.collection("economyRuleVersions").where("status", "==", "active").limit(5).get();
  const selected = active.docs
    .map((doc) => doc.data())
    .filter((record) => !record.effectiveAt || Date.parse(String(record.effectiveAt)) <= Date.now())
    .sort((a, b) => Date.parse(String(b.effectiveAt ?? b.approvedAt ?? "")) - Date.parse(String(a.effectiveAt ?? a.approvedAt ?? "")))
    .at(0);
  return selected?.rules ? { ...ECONOMY_V1_RULES, ...selected.rules, version: selected.version ?? selected.rules.version } as EconomyRules : ECONOMY_V1_RULES;
}

export function getEconomyRuleVersion(rules: EconomyRules = ECONOMY_V1_RULES) {
  return rules.version;
}

export function calculateDoroCoinReward(sourceType: keyof typeof ECONOMY_V1_RULES.doroCoin.rewards, rules: EconomyRules = ECONOMY_V1_RULES) {
  return Number(rules.doroCoin.rewards[sourceType]);
}

export function calculateChallengeCreditPrice(quantity: number, rules: EconomyRules = ECONOMY_V1_RULES) {
  return Math.max(0, Math.trunc(quantity)) / rules.challengeCredits.creditsPerUsd;
}

export function calculatePaidVoteCost(quantity: number, rules: EconomyRules = ECONOMY_V1_RULES) {
  return Math.max(0, Math.trunc(quantity)) * rules.voting.paidVoteCostCredits;
}

export function calculatePaidEntrySplit(amountCents: number, rules: EconomyRules = ECONOMY_V1_RULES) {
  const gross = Math.max(0, Math.trunc(amountCents));
  const winnerAmountCents = Math.floor(gross * rules.paidEntry.winnerPercent / 100);
  const platformAmountCents = Math.floor(gross * rules.paidEntry.platformPercent / 100);
  const creatorAmountCents = Math.floor(gross * rules.paidEntry.creatorPercent / 100);
  const hostSponsorAmountCents = gross - winnerAmountCents - platformAmountCents - creatorAmountCents;
  return { grossAmountCents: gross, winnerAmountCents, platformAmountCents, creatorAmountCents, hostSponsorAmountCents, ruleVersion: rules.version };
}

export function calculateGrowthWalletAllocation(amountCents: number, allocationPercent: number, rules: EconomyRules = ECONOMY_V1_RULES) {
  const percent = Math.min(rules.growthWallet.maximumAllocationPercent, Math.max(rules.growthWallet.minimumAllocationPercent, allocationPercent));
  return { allocationPercent: percent, amountCents: Math.floor(Math.max(0, amountCents) * percent / 100), ruleVersion: rules.version };
}

export function calculateCreatorLevel(input: { completedChallenges: number; participantCount: number; revenueCents: number; completionRate: number; disputeRate: number; verified: boolean }, rules: EconomyRules = ECONOMY_V1_RULES) {
  const score = Math.max(0, input.completedChallenges) * 40 + Math.floor(Math.max(0, input.participantCount) / 5) + Math.floor(Math.max(0, input.revenueCents) / 10_000) + Math.floor(Math.max(0, input.completionRate) * 100) - Math.floor(Math.max(0, input.disputeRate) * 200);
  const eligible = rules.creatorLevels.filter((level) => score >= level.minimumScore && (!("requiresVerification" in level) || !level.requiresVerification || input.verified));
  const level = eligible.at(-1) ?? rules.creatorLevels[0];
  const next = rules.creatorLevels[rules.creatorLevels.findIndex((item) => item.id === level.id) + 1] ?? null;
  return { level, score, nextLevel: next, progressToNext: next ? Math.min(100, Math.floor(score / next.minimumScore * 100)) : 100, ruleVersion: rules.version };
}
