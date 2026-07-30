import { randomInt, randomUUID } from "crypto";
import { FieldValue, type Firestore, type Transaction } from "firebase-admin/firestore";
import { deterministicId } from "@/lib/server/idempotency";

export type RewardSpinTier = "basic" | "standard" | "premium";
export type SpinCredits = Record<RewardSpinTier, number>;
const TIERS: RewardSpinTier[] = ["basic", "standard", "premium"];

export type RewardSettings = {
  id: string; rewardsEnabled: boolean; maintenanceMode: boolean; tierEnabled: Record<RewardSpinTier, boolean>;
  thresholds: SpinCredits; pointsPerDoroCoin: number; pointsAccumulate: boolean; maxSpinsPerDay: number;
  maxSpinsPerUser: number | null; spinCreditExpiryDays: number | null; rewardPointExpiryDays: number | null;
  animationDurationMs: number; resultDisplayDurationMs: number; primaryCampaignId: string | null;
  publicWheelRules: string; campaignTerms: string; supportContact: string; kycRequiredForHighValuePrizes: boolean;
  emailVerificationRequired: boolean; phoneVerificationRequired: boolean; addressVerificationRequiredForPhysicalPrizes: boolean;
  minimumAccountAgeDays: number; updatedAt?: string | null;
};
export type RewardCampaign = { id: string; campaignName: string; description: string; active: boolean; primary: boolean; startDate: string | null; endDate: string | null; associatedWheelTiers: RewardSpinTier[]; bannerImageUrl: string | null; terms: string; eligibleCountries: string[]; eligiblePlans: string[] };
export type RewardPrize = { id: string; prizeName: string; prizeDescription: string; prizeTier: RewardSpinTier; prizeType: string; fulfillmentType: "automatic" | "manual"; probabilityWeight: number; quantityType: "limited" | "unlimited"; totalQuantity: number | null; remainingQuantity: number | null; maximumWinsPerUser: number | null; maximumWinsPerDay: number | null; enabled: boolean; status: string; startDate: string | null; endDate: string | null; expiresAt: string | null; displayOrder: number; terms: string; campaignId: string | null; imageUrl: string | null; rewardValue: number; manualFulfillmentRequired: boolean; fulfillmentInstructions: string | null; createdByAdminId: string | null; winCount: number; cashOutEnabled: false };

export function emptySpinCredits(): SpinCredits { return { basic: 0, standard: 0, premium: 0 }; }
function n(value: unknown, fallback = 0) { const x = Math.floor(Number(value)); return Number.isFinite(x) ? Math.max(0, x) : fallback; }
function maybeNumber(value: unknown) { return value === undefined || value === null || value === "" ? null : n(value); }
function iso(value: unknown): string | null { if (!value) return null; if (typeof value === "string") return value; const ts = value as { toDate?: () => Date }; return typeof ts.toDate === "function" ? ts.toDate().toISOString() : null; }
function tier(value: unknown): RewardSpinTier { const candidate = String(value ?? "basic") as RewardSpinTier; return TIERS.includes(candidate) ? candidate : "basic"; }
export function normalizeSpinCredits(value: unknown): SpinCredits { const out = emptySpinCredits(); if (value && typeof value === "object") { const r = value as Record<string, unknown>; out.basic = n(r.basic); out.standard = n(r.standard); out.premium = n(r.premium); } else if (typeof value === "number") out.basic = n(value); return out; }

export const DEFAULT_REWARD_SETTINGS: RewardSettings = { id: "default", rewardsEnabled: true, maintenanceMode: false, tierEnabled: { basic: true, standard: true, premium: true }, thresholds: { basic: 100, standard: 250, premium: 500 }, pointsPerDoroCoin: 1, pointsAccumulate: true, maxSpinsPerDay: 10, maxSpinsPerUser: null, spinCreditExpiryDays: null, rewardPointExpiryDays: null, animationDurationMs: 4200, resultDisplayDurationMs: 7000, primaryCampaignId: null, publicWheelRules: "Reward points come only from server-confirmed DoroCoin purchases. Prize chances vary by reward availability and campaign configuration. Rewards cannot be cashed out.", campaignTerms: "Manual and high-value rewards require Challenge Suite review and fulfillment. DoroCoins are platform credits, not cash or legal tender.", supportContact: "support@challengesuite.com", kycRequiredForHighValuePrizes: true, emailVerificationRequired: false, phoneVerificationRequired: false, addressVerificationRequiredForPhysicalPrizes: true, minimumAccountAgeDays: 0 };
export const DEFAULT_REWARD_CAMPAIGN: RewardCampaign = { id: "launch-rewards", campaignName: "Launch Rewards", description: "Default rewards campaign shown until admins configure a campaign.", active: true, primary: true, startDate: null, endDate: null, associatedWheelTiers: TIERS, bannerImageUrl: null, terms: DEFAULT_REWARD_SETTINGS.campaignTerms, eligibleCountries: [], eligiblePlans: [] };
function prize(id: string, prizeName: string, prizeDescription: string, prizeTier: RewardSpinTier, prizeType: string, fulfillmentType: "automatic" | "manual", probabilityWeight: number, rewardValue = 0): RewardPrize { return { id, prizeName, prizeDescription, prizeTier, prizeType, fulfillmentType, probabilityWeight, quantityType: "unlimited", totalQuantity: null, remainingQuantity: null, maximumWinsPerUser: null, maximumWinsPerDay: null, enabled: true, status: "active", startDate: null, endDate: null, expiresAt: null, displayOrder: 0, terms: "Rewards are subject to Challenge Suite review. Rewards cannot be withdrawn as cash.", campaignId: null, imageUrl: null, rewardValue, manualFulfillmentRequired: fulfillmentType === "manual", fulfillmentInstructions: fulfillmentType === "manual" ? "Challenge Suite admin fulfillment required." : null, createdByAdminId: null, winCount: 0, cashOutEnabled: false }; }
export const DEFAULT_REWARD_PRIZES: RewardPrize[] = [
  prize("default-basic-dorocoin", "Small DoroCoin Bonus", "A small internal platform-credit bonus. DoroCoins are not cash.", "basic", "dorocoin_bonus", "automatic", 22, 25), prize("default-basic-vote", "1 Free Vote", "One bonus vote credit for eligible challenges.", "basic", "free_vote", "automatic", 24, 1), prize("default-basic-badge", "Basic Badge", "A profile badge added after the server confirms the reward.", "basic", "badge", "automatic", 18), prize("default-basic-discount", "Small Discount", "A manually reviewed discount reward.", "basic", "discount", "manual", 16), prize("default-basic-try-again", "Try Again", "No prize this time. Your spin remains recorded.", "basic", "try_again", "automatic", 20),
  prize("default-standard-dorocoin", "Larger DoroCoin Bonus", "A larger internal platform-credit bonus.", "standard", "dorocoin_bonus", "automatic", 22, 75), prize("default-standard-votes", "Multiple Free Votes", "Multiple bonus vote credits for eligible challenges.", "standard", "free_vote", "automatic", 22, 3), prize("default-standard-highlight", "Profile Highlight", "Profile highlight reviewed by the Challenge Suite team.", "standard", "profile_highlight", "manual", 18), prize("default-standard-coupon", "Sponsor Coupon", "Sponsor coupon fulfillment requires admin or sponsor review.", "standard", "sponsor_coupon", "manual", 18), prize("default-standard-entry", "Challenge Entry Discount", "A reviewed entry discount with no cash-out value.", "standard", "discount", "manual", 20),
  prize("default-premium-dorocoin", "Bigger DoroCoin Bonus", "Premium internal platform-credit bonus. No DoroCoin-to-cash conversion.", "premium", "dorocoin_bonus", "automatic", 20, 150), prize("default-premium-badge", "Premium Badge", "A premium profile badge added after server confirmation.", "premium", "badge", "automatic", 20), prize("default-premium-ticket", "Event Ticket", "Manual event-ticket fulfillment.", "premium", "event_ticket", "manual", 15), prize("default-premium-merch", "Merch/Product Prize", "Manual physical or partner prize fulfillment.", "premium", "merch", "manual", 20), prize("default-premium-gift", "Gift Card / Manual Prize", "Manual fulfillment only. No cash-out prize is enabled by default.", "premium", "gift_card", "manual", 25)
];

export function normalizeRewardSettings(data?: Record<string, unknown> | null): RewardSettings { const thresholds = normalizeSpinCredits(data?.thresholds ?? data?.spinThresholds); const raw = data?.tierEnabled && typeof data.tierEnabled === "object" ? data.tierEnabled as Record<string, unknown> : {}; return { ...DEFAULT_REWARD_SETTINGS, id: String(data?.id ?? "default"), rewardsEnabled: data?.rewardsEnabled !== false, maintenanceMode: Boolean(data?.maintenanceMode), tierEnabled: { basic: raw.basic !== false, standard: raw.standard !== false, premium: raw.premium !== false }, thresholds: { basic: thresholds.basic || 100, standard: thresholds.standard || 250, premium: thresholds.premium || 500 }, pointsPerDoroCoin: Math.max(0, Number(data?.pointsPerDoroCoin ?? 1)), pointsAccumulate: data?.pointsAccumulate !== false, maxSpinsPerDay: n(data?.maxSpinsPerDay, 10), maxSpinsPerUser: maybeNumber(data?.maxSpinsPerUser), spinCreditExpiryDays: maybeNumber(data?.spinCreditExpiryDays), rewardPointExpiryDays: maybeNumber(data?.rewardPointExpiryDays), animationDurationMs: n(data?.animationDurationMs, 4200), resultDisplayDurationMs: n(data?.resultDisplayDurationMs, 7000), primaryCampaignId: typeof data?.primaryCampaignId === "string" && data.primaryCampaignId ? data.primaryCampaignId : null, publicWheelRules: String(data?.publicWheelRules ?? DEFAULT_REWARD_SETTINGS.publicWheelRules), campaignTerms: String(data?.campaignTerms ?? DEFAULT_REWARD_SETTINGS.campaignTerms), supportContact: String(data?.supportContact ?? DEFAULT_REWARD_SETTINGS.supportContact), kycRequiredForHighValuePrizes: data?.kycRequiredForHighValuePrizes !== false, emailVerificationRequired: Boolean(data?.emailVerificationRequired), phoneVerificationRequired: Boolean(data?.phoneVerificationRequired), addressVerificationRequiredForPhysicalPrizes: data?.addressVerificationRequiredForPhysicalPrizes !== false, minimumAccountAgeDays: n(data?.minimumAccountAgeDays), updatedAt: iso(data?.updatedAt) }; }
export async function getRewardSettings(db: Firestore) { const snap = await db.collection("rewardSettings").doc("default").get(); return normalizeRewardSettings(snap.exists ? { id: snap.id, ...snap.data() } : null); }
export function normalizeRewardCampaign(id: string, data?: Record<string, unknown> | null): RewardCampaign { if (!data) return DEFAULT_REWARD_CAMPAIGN; return { id, campaignName: String(data.campaignName ?? data.name ?? "Rewards Campaign"), description: String(data.description ?? ""), active: data.active !== false, primary: Boolean(data.primary), startDate: iso(data.startDate), endDate: iso(data.endDate), associatedWheelTiers: Array.isArray(data.associatedWheelTiers) ? data.associatedWheelTiers.map(tier).filter(Boolean) : TIERS, bannerImageUrl: typeof data.bannerImageUrl === "string" ? data.bannerImageUrl : null, terms: String(data.terms ?? DEFAULT_REWARD_SETTINGS.campaignTerms), eligibleCountries: Array.isArray(data.eligibleCountries) ? data.eligibleCountries.map(String) : [], eligiblePlans: Array.isArray(data.eligiblePlans) ? data.eligiblePlans.map(String) : [] }; }
export async function getActiveRewardCampaign(db: Firestore, settings?: RewardSettings) { if (settings?.primaryCampaignId) { const snap = await db.collection("rewardCampaigns").doc(settings.primaryCampaignId).get(); if (snap.exists) return normalizeRewardCampaign(snap.id, snap.data()); } const snap = await db.collection("rewardCampaigns").where("active", "==", true).limit(25).get(); const campaigns = snap.docs.map((doc) => normalizeRewardCampaign(doc.id, doc.data())); return campaigns.find((c) => c.primary) ?? campaigns[0] ?? DEFAULT_REWARD_CAMPAIGN; }
export function normalizeRewardPrize(id: string, data: Record<string, unknown>): RewardPrize { const prizeType = String(data.prizeType ?? data.rewardType ?? "manual_prize"); const manual = data.manualFulfillmentRequired === true || data.fulfillmentType === "manual" || ["merch", "gift_card", "event_ticket", "manual_prize", "sponsor_coupon", "physical_reward", "electronics", "custom_prize", "profile_highlight", "discount"].includes(prizeType); const total = data.totalQuantity ?? data.quantity; const remaining = data.remainingQuantity ?? data.quantity; return { id, prizeName: String(data.prizeName ?? data.name ?? "Reward Prize"), prizeDescription: String(data.prizeDescription ?? data.description ?? ""), prizeTier: tier(data.prizeTier ?? data.tier), prizeType, fulfillmentType: manual ? "manual" : "automatic", probabilityWeight: Math.max(0, Number(data.probabilityWeight ?? data.weight ?? 1)), quantityType: data.quantityType === "unlimited" || remaining === null || remaining === undefined || remaining === "" ? "unlimited" : "limited", totalQuantity: maybeNumber(total), remainingQuantity: maybeNumber(remaining), maximumWinsPerUser: maybeNumber(data.maximumWinsPerUser), maximumWinsPerDay: maybeNumber(data.maximumWinsPerDay), enabled: data.enabled !== false, status: String(data.status ?? "active"), startDate: iso(data.startDate), endDate: iso(data.endDate), expiresAt: iso(data.expiresAt), displayOrder: Number(data.displayOrder ?? 0), terms: String(data.terms ?? "Rewards cannot be withdrawn as cash."), campaignId: typeof data.campaignId === "string" ? data.campaignId : null, imageUrl: typeof data.imageUrl === "string" ? data.imageUrl : null, rewardValue: Number(data.rewardValue ?? data.value ?? 0), manualFulfillmentRequired: manual, fulfillmentInstructions: typeof data.fulfillmentInstructions === "string" ? data.fulfillmentInstructions : null, createdByAdminId: typeof data.createdByAdminId === "string" ? data.createdByAdminId : null, winCount: n(data.winCount), cashOutEnabled: false }; }
export function isPrizeActive(prize: RewardPrize, now = Date.now(), campaignId?: string | null) { if (!prize.enabled || prize.status !== "active" || prize.probabilityWeight <= 0) return false; if (campaignId && prize.campaignId && prize.campaignId !== campaignId) return false; if (prize.startDate && Date.parse(prize.startDate) > now) return false; const end = prize.endDate ?? prize.expiresAt; if (end && Date.parse(end) < now) return false; if (prize.quantityType === "limited" && prize.remainingQuantity !== null && prize.remainingQuantity <= 0) return false; return true; }
export function availablePrizesForTier(prizes: RewardPrize[], selectedTier: RewardSpinTier, now = Date.now(), campaignId?: string | null) { return prizes.filter((p) => p.prizeTier === selectedTier && isPrizeActive(p, now, campaignId)).sort((a, b) => a.displayOrder - b.displayOrder || a.prizeName.localeCompare(b.prizeName)); }
export function chooseRewardPrize(prizes: RewardPrize[], selectedTier: RewardSpinTier, now = Date.now(), campaignId?: string | null) { const available = availablePrizesForTier(prizes, selectedTier, now, campaignId); const total = available.reduce((sum, p) => sum + p.probabilityWeight, 0); if (!available.length || total <= 0) return null; let cursor = randomInt(Math.max(1, Math.ceil(total * 1000))) / 1000; for (const p of available) { cursor -= p.probabilityWeight; if (cursor <= 0) return p; } return available[available.length - 1]; }
export function rewardPrizesNeedSetup(prizes: RewardPrize[]) { return !prizes.length || prizes.every((prize) => prize.id.startsWith("default-")); }
export async function loadRewardPrizes(db: Firestore) { const snap = await db.collection("rewardPrizes").where("enabled", "==", true).limit(500).get(); const configured = snap.docs.map((doc) => normalizeRewardPrize(doc.id, doc.data())); if (configured.length) return configured; const legacy = await db.collection("rewardWheelPrizes").where("enabled", "==", true).limit(500).get(); const old = legacy.docs.map((doc) => normalizeRewardPrize(doc.id, doc.data())); return old.length ? old : DEFAULT_REWARD_PRIZES; }
export function publicPrize(prize: RewardPrize) { return { id: prize.id, prizeName: prize.prizeName, prizeDescription: prize.prizeDescription, prizeTier: prize.prizeTier, prizeType: prize.prizeType, fulfillmentType: prize.fulfillmentType, imageUrl: prize.imageUrl, terms: prize.terms, manualFulfillmentRequired: prize.manualFulfillmentRequired, displayOrder: prize.displayOrder, cashOutEnabled: false }; }
function totalCredits(credits: SpinCredits) { return credits.basic + credits.standard + credits.premium; }
export function tierDefinitions(settings: RewardSettings) { return TIERS.map((t) => ({ id: t, label: `${t[0].toUpperCase()}${t.slice(1)} Wheel`, spinTier: t, pointsRequired: settings.thresholds[t], spinCredits: 1, enabled: settings.tierEnabled[t] })); }

export async function buildRewardSummary(db: Firestore, userId: string) {
  const [settings, userSnap, profileSnap, historySnap, claimsSnap] = await Promise.all([
    getRewardSettings(db), db.collection("users").doc(userId).get(), db.collection("userRewards").doc(userId).get(), db.collection("spinResults").where("userId", "==", userId).limit(50).get(), db.collection("rewardClaims").where("userId", "==", userId).limit(50).get()
  ]);
  const campaign = await getActiveRewardCampaign(db, settings);
  const prizes = await loadRewardPrizes(db);
  const prizeSetupRequired = rewardPrizesNeedSetup(prizes);
  const displayPrizes = prizeSetupRequired ? [] : prizes;
  const profile = { ...(userSnap.data() ?? {}), ...(profileSnap.data() ?? {}) };
  const points = Number(profile.availableRewardPoints ?? profile.voterPoints ?? 0);
  const lifetime = Number(profile.lifetimeRewardPoints ?? profile.voterPoints ?? 0);
  const credits = normalizeSpinCredits(profile.spinCredits ?? profile.rewardSpinCreditsByTier ?? profile.rewardSpinCredits);
  const next = tierDefinitions(settings).find((t) => points < t.pointsRequired) ?? null;
  return { settings, campaign, points, availableRewardPoints: points, lifetimeRewardPoints: lifetime, spinCreditsByTier: credits, spinCredits: totalCredits(credits), tiers: tierDefinitions(settings), progress: { nextTier: next, pointsNeeded: next ? Math.max(0, next.pointsRequired - points) : 0 }, prizeSetupRequired, prizes: TIERS.reduce((acc, t) => ({ ...acc, [t]: availablePrizesForTier(displayPrizes, t, Date.now(), campaign.id).map(publicPrize) }), {} as Record<RewardSpinTier, ReturnType<typeof publicPrize>[]>), history: historySnap.docs.map((doc) => ({ id: doc.id, ...doc.data() })), claims: claimsSnap.docs.map((doc) => ({ id: doc.id, ...doc.data() })), recentRewards: historySnap.docs.slice(0, 5).map((doc) => ({ id: doc.id, ...doc.data() })), safety: { pointsSource: "server_confirmed_dorocoin_purchase_only", clientCanGrantPoints: false, clientCanGrantSpinCredits: false, serverSelectsPrize: true, cashOutEnabled: false, rewardSelectionExposedToBrowser: false } };
}

export async function awardDoroCoinPurchaseRewards(db: Firestore, input: { userId: string; coins: number; sourceId: string; eventId: string }) {
  const settings = await getRewardSettings(db);
  if (!settings.rewardsEnabled || settings.maintenanceMode) return { pointsAwarded: 0, spinCreditsAwarded: emptySpinCredits(), rewardEventId: null, skipped: "rewards_disabled" };
  const pointsAwarded = Math.max(0, Math.floor(Number(input.coins) * settings.pointsPerDoroCoin));
  if (!pointsAwarded) return { pointsAwarded: 0, spinCreditsAwarded: emptySpinCredits(), rewardEventId: null };
  const now = new Date().toISOString();
  const rewardEventId = deterministicId("dorocoin_purchase_reward", input.sourceId, input.eventId, input.userId);
  const rewardEventRef = db.collection("voterRewardEvents").doc(rewardEventId);
  const userRef = db.collection("users").doc(input.userId);
  const rewardRef = db.collection("userRewards").doc(input.userId);
  const result = await db.runTransaction(async (transaction) => {
    const existing = await transaction.get(rewardEventRef);
    if (existing.exists) return { duplicate: true, pointsAwarded: 0, spinCreditsAwarded: emptySpinCredits() };
    const [userSnap, rewardSnap] = await Promise.all([transaction.get(userRef), transaction.get(rewardRef)]);
    const merged = { ...(userSnap.data() ?? {}), ...(rewardSnap.data() ?? {}) };
    const previousPoints = Number(merged.availableRewardPoints ?? merged.voterPoints ?? 0);
    const previousLifetime = Number(merged.lifetimeRewardPoints ?? merged.voterPoints ?? 0);
    const nextPoints = previousPoints + pointsAwarded;
    const credits = normalizeSpinCredits(merged.spinCredits ?? merged.rewardSpinCreditsByTier ?? merged.rewardSpinCredits);
    const spinCreditsAwarded = emptySpinCredits();
    for (const t of TIERS) {
      const threshold = settings.thresholds[t];
      if (!threshold) continue;
      const before = settings.pointsAccumulate ? Math.floor(previousPoints / threshold) : previousPoints >= threshold ? 1 : 0;
      const after = settings.pointsAccumulate ? Math.floor(nextPoints / threshold) : nextPoints >= threshold ? 1 : 0;
      const unlocked = Math.max(0, after - before);
      if (!unlocked) continue;
      spinCreditsAwarded[t] += unlocked;
      credits[t] += unlocked;
      for (let i = 0; i < unlocked; i += 1) {
        const creditRef = rewardRef.collection("spinCredits").doc(deterministicId("spin_credit", rewardEventId, t, String(i)));
        transaction.set(creditRef, { id: creditRef.id, userId: input.userId, tier: t, sourceType: "dorocoin_purchase", sourceId: input.sourceId, rewardEventId, status: "available", used: false, createdAt: now, expiresAt: settings.spinCreditExpiryDays ? new Date(Date.now() + settings.spinCreditExpiryDays * 86400000).toISOString() : null });
      }
    }
    const payload = { userId: input.userId, availableRewardPoints: nextPoints, lifetimeRewardPoints: previousLifetime + pointsAwarded, spinCredits: credits, basicSpinCredits: credits.basic, standardSpinCredits: credits.standard, premiumSpinCredits: credits.premium, updatedAt: now, createdAt: rewardSnap.exists ? rewardSnap.data()?.createdAt ?? now : now };
    transaction.set(rewardRef, payload, { merge: true });
    transaction.set(userRef, { voterPoints: nextPoints, rewardSpinCredits: totalCredits(credits), rewardSpinCreditsByTier: credits, updatedAt: now }, { merge: true });
    transaction.create(rewardRef.collection("pointTransactions").doc(rewardEventId), { id: rewardEventId, userId: input.userId, type: "dorocoin_purchase_points_awarded", sourceType: "stripe_webhook", sourceId: input.sourceId, stripeEventId: input.eventId, pointsAwarded, previousPoints, nextPoints, spinCreditsAwarded, cashOutEnabled: false, createdAt: now });
    transaction.create(rewardEventRef, { id: rewardEventId, userId: input.userId, sourceType: "dorocoin_purchase", sourceId: input.sourceId, stripeEventId: input.eventId, pointsAwarded, spinCreditsAwarded, status: "recorded_after_server_confirmed_purchase", cashOutEnabled: false, createdAt: now });
    const auditId = deterministicId("reward_audit", rewardEventId);
    transaction.create(db.collection("rewardAuditLogs").doc(auditId), { id: auditId, userId: input.userId, action: "dorocoin_purchase_points_awarded", source: "stripe_webhook", pointsAwarded, spinCreditsAwarded, createdAt: now });
    return { duplicate: false, pointsAwarded, spinCreditsAwarded };
  });
  return { ...result, rewardEventId };
}

function spinAvailabilityError(settings: RewardSettings, selectedTier: RewardSpinTier, campaign: RewardCampaign | null, user: Record<string, unknown>, credits: SpinCredits, prizes: RewardPrize[], dailyCount: number, totalCount: number) {
  const now = Date.now();
  if (!settings.rewardsEnabled) return "REWARDS_DISABLED";
  if (settings.maintenanceMode) return "REWARDS_MAINTENANCE";
  if (!settings.tierEnabled[selectedTier]) return "WHEEL_DISABLED";
  if (campaign?.startDate && Date.parse(campaign.startDate) > now) return "CAMPAIGN_NOT_STARTED";
  if (campaign?.endDate && Date.parse(campaign.endDate) < now) return "CAMPAIGN_ENDED";
  if (String(user.accountStatus ?? "active") === "suspended") return "ACCOUNT_SUSPENDED";
  if (credits[selectedTier] <= 0) return "NO_SPIN_CREDITS";
  if (settings.maxSpinsPerDay > 0 && dailyCount >= settings.maxSpinsPerDay) return "DAILY_LIMIT_REACHED";
  if (settings.maxSpinsPerUser !== null && totalCount >= settings.maxSpinsPerUser) return "USER_LIMIT_REACHED";
  if (!prizes.length) return "NO_AVAILABLE_PRIZES";
  if (settings.emailVerificationRequired && user.emailVerified !== true) return "EMAIL_VERIFICATION_REQUIRED";
  return null;
}

export async function executeRewardSpin(db: Firestore, input: { userId: string; tier: RewardSpinTier; idempotencyKey?: string | null }) {
  const settings = await getRewardSettings(db);
  const campaign = await getActiveRewardCampaign(db, settings);
  const allPrizes = await loadRewardPrizes(db);
  if (rewardPrizesNeedSetup(allPrizes)) throw new Error("REWARD_PRIZES_NOT_CONFIGURED");
  const prizes = availablePrizesForTier(allPrizes, input.tier, Date.now(), campaign.id);
  const selected = chooseRewardPrize(prizes, input.tier, Date.now(), campaign.id);
  if (!selected) throw new Error("NO_AVAILABLE_PRIZES");
  const now = new Date().toISOString();
  const today = now.slice(0, 10);
  const spinId = input.idempotencyKey ? deterministicId("reward_spin", input.userId, input.tier, input.idempotencyKey) : randomUUID();
  const spinRef = db.collection("spinResults").doc(spinId);
  const result = await db.runTransaction(async (transaction) => {
    const existing = await transaction.get(spinRef);
    if (existing.exists) return { alreadyProcessed: true, spin: { id: existing.id, ...existing.data() } };
    const userRef = db.collection("users").doc(input.userId);
    const rewardRef = db.collection("userRewards").doc(input.userId);
    const dailyRef = db.collection("rewardDailySpinUsage").doc(`${input.userId}_${today}`);
    const totalRef = db.collection("rewardUserSpinUsage").doc(input.userId);
    const [userSnap, rewardSnap, dailySnap, totalSnap] = await Promise.all([transaction.get(userRef), transaction.get(rewardRef), transaction.get(dailyRef), transaction.get(totalRef)]);
    const user = userSnap.data() ?? {};
    const reward = rewardSnap.data() ?? {};
    const credits = normalizeSpinCredits(reward.spinCredits ?? user.rewardSpinCreditsByTier ?? user.rewardSpinCredits);
    const error = spinAvailabilityError(settings, input.tier, campaign, user, credits, prizes, Number(dailySnap.data()?.count ?? 0), Number(totalSnap.data()?.count ?? 0));
    if (error) throw new Error(error);
    const prizeRef = selected.id.startsWith("default-") ? null : db.collection("rewardPrizes").doc(selected.id);
    let prizeSnapshot = selected;
    if (prizeRef) {
      const prizeSnap = await transaction.get(prizeRef);
      if (!prizeSnap.exists) throw new Error("PRIZE_NOT_FOUND");
      prizeSnapshot = normalizeRewardPrize(prizeSnap.id, prizeSnap.data() ?? {});
      if (!isPrizeActive(prizeSnapshot, Date.now(), campaign.id)) throw new Error("PRIZE_UNAVAILABLE");
      if (prizeSnapshot.quantityType === "limited" && prizeSnapshot.remainingQuantity !== null) {
        if (prizeSnapshot.remainingQuantity <= 0) throw new Error("PRIZE_OUT_OF_STOCK");
        transaction.set(prizeRef, { remainingQuantity: prizeSnapshot.remainingQuantity - 1, quantity: prizeSnapshot.remainingQuantity - 1, winCount: prizeSnapshot.winCount + 1, updatedAt: now }, { merge: true });
      } else transaction.set(prizeRef, { winCount: prizeSnapshot.winCount + 1, updatedAt: now }, { merge: true });
    }
    credits[input.tier] -= 1;
    const fulfillmentStatus = prizeSnapshot.manualFulfillmentRequired ? "awaiting_claim" : prizeSnapshot.prizeType === "try_again" ? "no_reward" : "credited";
    const spin = { id: spinId, userId: input.userId, wheelTier: input.tier, campaignId: campaign.id, prizeId: prizeSnapshot.id, prizeName: prizeSnapshot.prizeName, prizeDescription: prizeSnapshot.prizeDescription, prizeType: prizeSnapshot.prizeType, prizeTier: prizeSnapshot.prizeTier, imageUrl: prizeSnapshot.imageUrl, rewardValue: prizeSnapshot.rewardValue, status: "confirmed", spinStatus: "confirmed", rewardStatus: fulfillmentStatus, fulfillmentStatus, manualFulfillmentRequired: prizeSnapshot.manualFulfillmentRequired, serverSelected: true, idempotencyKey: input.idempotencyKey ?? null, probabilitySnapshot: { prizeId: prizeSnapshot.id, prizeWeight: prizeSnapshot.probabilityWeight, activePrizeCount: prizes.length, totalWeight: prizes.reduce((sum, p) => sum + p.probabilityWeight, 0) }, cashOutEnabled: false, createdAt: now, updatedAt: now };
    transaction.set(rewardRef, { userId: input.userId, spinCredits: credits, basicSpinCredits: credits.basic, standardSpinCredits: credits.standard, premiumSpinCredits: credits.premium, updatedAt: now, createdAt: reward.createdAt ?? now }, { merge: true });
    transaction.set(userRef, { rewardSpinCredits: totalCredits(credits), rewardSpinCreditsByTier: credits, updatedAt: now }, { merge: true });
    transaction.create(spinRef, spin);
    transaction.create(db.collection("rewardSpinHistory").doc(spinId), spin);
    transaction.create(rewardRef.collection("spinHistory").doc(spinId), spin);
    transaction.set(dailyRef, { id: dailyRef.id, userId: input.userId, date: today, count: Number(dailySnap.data()?.count ?? 0) + 1, updatedAt: now }, { merge: true });
    transaction.set(totalRef, { id: input.userId, userId: input.userId, count: Number(totalSnap.data()?.count ?? 0) + 1, updatedAt: now }, { merge: true });
    applyRewardSideEffects(transaction, db, input.userId, spinId, prizeSnapshot, now);
    const auditId = deterministicId("reward_spin_audit", spinId);
    transaction.create(db.collection("rewardAuditLogs").doc(auditId), { id: auditId, userId: input.userId, spinId, action: "reward_spin_confirmed", tier: input.tier, prizeId: prizeSnapshot.id, serverSelected: true, cashOutEnabled: false, createdAt: now });
    return { alreadyProcessed: false, spin };
  });
  return { ...result, spin: { ...result.spin, prize: publicPrize(selected) }, settings, campaign };
}

function applyRewardSideEffects(transaction: Transaction, db: Firestore, userId: string, spinId: string, prize: RewardPrize, now: string) {
  const rewardRef = db.collection("userRewards").doc(userId);
  if (prize.manualFulfillmentRequired) {
    const claim = { id: spinId, userId, spinId, prizeId: prize.id, prizeName: prize.prizeName, prizeType: prize.prizeType, status: "awaiting_claim", claimStatus: "awaiting_claim", fulfillmentStatus: "awaiting_claim", claimRequired: true, cashOutEnabled: false, createdAt: now, updatedAt: now };
    transaction.create(db.collection("rewardClaims").doc(spinId), claim);
    transaction.create(db.collection("rewardFulfilments").doc(spinId), { ...claim, assignedAdminId: null, internalNotes: null });
    transaction.create(db.collection("rewardFulfillments").doc(spinId), { ...claim, assignedAdminId: null, internalNotes: null });
    return;
  }
  const award = { id: spinId, userId, spinId, prizeId: prize.id, prizeName: prize.prizeName, prizeType: prize.prizeType, status: prize.prizeType === "try_again" ? "completed" : "credited", fulfillmentStatus: prize.prizeType === "try_again" ? "no_reward" : "credited", rewardValue: prize.rewardValue, cashOutEnabled: false, createdAt: now, updatedAt: now };
  transaction.create(rewardRef.collection("awards").doc(spinId), award);
  if (prize.prizeType === "dorocoin_bonus" && prize.rewardValue > 0) {
    const walletRef = db.collection("doroCoinWallets").doc(userId);
    const txnRef = db.collection("doroCoinTransactions").doc(deterministicId("reward_dorocoin_bonus", spinId));
    transaction.set(walletRef, { userId, balance: FieldValue.increment(prize.rewardValue), updatedAt: now }, { merge: true });
    transaction.create(txnRef, { id: txnRef.id, userId, amount: prize.rewardValue, type: "reward", description: `Reward wheel DoroCoin bonus: ${prize.prizeName}. DoroCoins are not cash.`, sourceId: spinId, idempotencyKey: txnRef.id, createdBy: "reward_spin_server", cashOutEnabled: false, createdAt: now });
  }
}

export async function createRewardClaim(db: Firestore, input: { userId: string; claimId: string; legalName: string; email: string; phone?: string; deliveryAddress?: string; termsAccepted: boolean }) {
  if (!input.termsAccepted) throw new Error("TERMS_REQUIRED");
  const now = new Date().toISOString();
  const claimRef = db.collection("rewardClaims").doc(input.claimId);
  return db.runTransaction(async (transaction) => {
    const claimSnap = await transaction.get(claimRef);
    if (!claimSnap.exists) throw new Error("CLAIM_NOT_FOUND");
    const claim = claimSnap.data() ?? {};
    if (claim.userId !== input.userId) throw new Error("CLAIM_FORBIDDEN");
    if (!["awaiting_claim", "claim_rejected"].includes(String(claim.claimStatus ?? claim.status))) throw new Error("CLAIM_ALREADY_SUBMITTED");
    const payload = { claimStatus: "claim_submitted", status: "claim_submitted", fulfillmentStatus: "claim_under_review", legalName: input.legalName.slice(0, 120), email: input.email.slice(0, 180), phone: input.phone?.slice(0, 60) ?? null, deliveryAddress: input.deliveryAddress?.slice(0, 1000) ?? null, termsAccepted: true, submittedAt: now, updatedAt: now, claimReference: `CS-${input.claimId.slice(0, 8).toUpperCase()}` };
    transaction.set(claimRef, payload, { merge: true });
    transaction.set(db.collection("rewardFulfilments").doc(input.claimId), payload, { merge: true });
    transaction.set(db.collection("rewardFulfillments").doc(input.claimId), payload, { merge: true });
    const auditId = deterministicId("reward_claim", input.claimId, now);
    transaction.create(db.collection("rewardAuditLogs").doc(auditId), { id: auditId, userId: input.userId, claimId: input.claimId, action: "reward_claim_submitted", createdAt: now });
    return { id: input.claimId, ...claim, ...payload };
  });
}

export function adminPrizePayload(body: Record<string, unknown>, adminId: string) {
  const now = new Date().toISOString();
  const quantityType = body.quantityType === "unlimited" ? "unlimited" : "limited";
  const fulfillmentType = body.fulfillmentType === "automatic" ? "automatic" : "manual";
  return { prizeName: String(body.prizeName ?? body.name ?? "Untitled prize").slice(0, 120), prizeDescription: String(body.prizeDescription ?? body.description ?? "").slice(0, 500), prizeTier: tier(body.prizeTier ?? body.tier), prizeType: String(body.prizeType ?? "manual_prize"), fulfillmentType, manualFulfillmentRequired: fulfillmentType === "manual", probabilityWeight: Math.max(0, Number(body.probabilityWeight ?? 1)), quantityType, totalQuantity: quantityType === "unlimited" ? null : n(body.totalQuantity ?? body.quantity), remainingQuantity: quantityType === "unlimited" ? null : n(body.remainingQuantity ?? body.totalQuantity ?? body.quantity), maximumWinsPerUser: maybeNumber(body.maximumWinsPerUser), maximumWinsPerDay: maybeNumber(body.maximumWinsPerDay), enabled: body.enabled !== false, status: String(body.status ?? "active"), startDate: typeof body.startDate === "string" && body.startDate ? body.startDate : null, endDate: typeof body.endDate === "string" && body.endDate ? body.endDate : null, expiresAt: typeof body.expiresAt === "string" && body.expiresAt ? body.expiresAt : null, displayOrder: Number(body.displayOrder ?? 0), terms: String(body.terms ?? "Rewards cannot be withdrawn as cash.").slice(0, 2000), campaignId: typeof body.campaignId === "string" && body.campaignId ? body.campaignId : null, imageUrl: typeof body.imageUrl === "string" && body.imageUrl ? body.imageUrl : null, rewardValue: Number(body.rewardValue ?? 0), fulfillmentInstructions: typeof body.fulfillmentInstructions === "string" ? body.fulfillmentInstructions.slice(0, 2000) : null, updatedAt: now, createdByAdminId: adminId, cashOutEnabled: false };
}

