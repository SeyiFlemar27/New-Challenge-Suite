import { createHash, randomInt, randomUUID } from "crypto";
import { FieldValue, type Firestore } from "firebase-admin/firestore";
import { deterministicId } from "@/lib/server/idempotency";
import { ACHIEVEMENT_CATALOG, STREAK_MILESTONES, grantRewardPointsForEvent, isConsumerRewardsEligible, rewardEntitlementPayload, type RewardEntitlementType } from "@/lib/server/reward-economy";
import { REWARD_WHEEL_POINT_COSTS, REWARD_WHEEL_PROBABILITY_UNITS, probabilityUnitsFromRelativeWeights, type PublicRewardWheelConfig, type RewardWheelProbabilityEntry } from "@/lib/reward-wheel-contracts";

export type RewardSpinTier = "basic" | "standard" | "premium";
export type SpinCredits = Record<RewardSpinTier, number>;
const TIERS: RewardSpinTier[] = ["basic", "standard", "premium"];
export const SUPPORTED_SPIN_REWARD_TYPES = ["reward_points", "dorocoin", "cash", "free_entry", "fixed_entry_discount", "percentage_entry_discount", "creator_boost", "bonus_spin"] as const;
export type RewardSettings = { id: string; rewardsEnabled: boolean; maintenanceMode: boolean; rewardEarningPaused: boolean; rewardFulfillmentPaused: boolean; tierEnabled: Record<RewardSpinTier, boolean>; thresholds: SpinCredits; spinCosts: SpinCredits; pointsPerDoroCoin: number; pointsAccumulate: boolean; maxSpinsPerDay: number; maxSpinsPerUser: number | null; spinCreditExpiryDays: number | null; rewardPointExpiryDays: number | null; animationDurationMs: number; resultDisplayDurationMs: number; primaryCampaignId: string | null; publicWheelRules: string; campaignTerms: string; supportContact: string; kycRequiredForHighValuePrizes: boolean; emailVerificationRequired: boolean; phoneVerificationRequired: boolean; addressVerificationRequiredForPhysicalPrizes: boolean; minimumAccountAgeDays: number; updatedAt?: string | null };
export type RewardCampaign = { id: string; campaignName: string; description: string; active: boolean; primary: boolean; startDate: string | null; endDate: string | null; associatedWheelTiers: RewardSpinTier[]; bannerImageUrl: string | null; terms: string; eligibleCountries: string[]; eligiblePlans: string[] };
export type RewardPrize = { id: string; prizeName: string; prizeDescription: string; prizeTier: RewardSpinTier; prizeType: string; rarity: "common" | "uncommon" | "rare" | "very_rare"; fulfillmentType: "automatic" | "manual"; probabilityWeight: number; quantityType: "limited" | "unlimited"; totalQuantity: number | null; remainingQuantity: number | null; reservedQuantity: number; maximumWinsPerUser: number | null; maximumWinsPerDay: number | null; enabled: boolean; status: string; startDate: string | null; endDate: string | null; expiresAt: string | null; entitlementExpiresAt: string | null; displayOrder: number; terms: string; campaignId: string | null; imageUrl: string | null; rewardValue: number; maximumDiscountCents?: number | null; unit: string | null; currency: "USD" | null; economicValueCents: number; budgetId: string | null; manualFulfillmentRequired: boolean; fulfillmentInstructions: string | null; brand: string | null; model: string | null; variant: string | null; sku: string | null; deliveryCountries: string[]; shippingPolicy: string | null; customsPolicy: string | null; deliveryDetailsDeadlineDays: number; estimatedFulfillmentDays: number | null; createdByAdminId: string | null; winCount: number; cashOutEnabled: false };
export type RewardWheelEntry = { prizeId: string; weight: number; probabilityUnits?: number };
export type ResolvedRewardWheel = { tier: RewardSpinTier; versionId: string | null; pointCost: number; prizes: RewardPrize[]; diagnosticCode: string | null };

export function emptySpinCredits(): SpinCredits { return { basic: 0, standard: 0, premium: 0 }; }
function n(value: unknown, fallback = 0) { const parsed = Math.floor(Number(value)); return Number.isFinite(parsed) ? Math.max(0, parsed) : fallback; }
function maybeNumber(value: unknown) { return value === undefined || value === null || value === "" ? null : n(value); }
function iso(value: unknown): string | null { if (!value) return null; if (typeof value === "string") return value; const timestamp = value as { toDate?: () => Date }; return typeof timestamp.toDate === "function" ? timestamp.toDate().toISOString() : null; }
function tier(value: unknown): RewardSpinTier { const candidate = String(value ?? "basic") as RewardSpinTier; return TIERS.includes(candidate) ? candidate : "basic"; }
function rarity(value: unknown): RewardPrize["rarity"] { const candidate = String(value ?? "common") as RewardPrize["rarity"]; return ["common", "uncommon", "rare", "very_rare"].includes(candidate) ? candidate : "common"; }
export function normalizeSpinCredits(value: unknown): SpinCredits { const out = emptySpinCredits(); if (value && typeof value === "object") { const row = value as Record<string, unknown>; TIERS.forEach((item) => { out[item] = n(row[item]); }); } return out; }

export const DEFAULT_REWARD_SETTINGS: RewardSettings = { id: "default", rewardsEnabled: true, maintenanceMode: false, rewardEarningPaused: false, rewardFulfillmentPaused: false, tierEnabled: { basic: true, standard: true, premium: true }, thresholds: REWARD_WHEEL_POINT_COSTS, spinCosts: REWARD_WHEEL_POINT_COSTS, pointsPerDoroCoin: 0, pointsAccumulate: false, maxSpinsPerDay: 0, maxSpinsPerUser: null, spinCreditExpiryDays: null, rewardPointExpiryDays: null, animationDurationMs: 4200, resultDisplayDurationMs: 7000, primaryCampaignId: null, publicWheelRules: "Reward Points are earned from eligible server-confirmed activity. Spins may be repeated while your balance permits. Every completed Spin awards a reward.", campaignTerms: "Reward Points and DoroCoins are separate non-cash balances. DoroCoins are platform credits, not cash. Rewards cannot be cashed out. No DoroCoin-to-cash conversion. Rewards cannot be withdrawn as cash.", supportContact: "support@challengesuite.com", kycRequiredForHighValuePrizes: false, emailVerificationRequired: false, phoneVerificationRequired: false, addressVerificationRequiredForPhysicalPrizes: true, minimumAccountAgeDays: 0 };
export const DEFAULT_REWARD_CAMPAIGN: RewardCampaign = { id: "launch-rewards-v1", campaignName: "Challenge Suite Rewards", description: "Launch Rewards configuration.", active: true, primary: true, startDate: null, endDate: null, associatedWheelTiers: TIERS, bannerImageUrl: null, terms: DEFAULT_REWARD_SETTINGS.campaignTerms, eligibleCountries: [], eligiblePlans: [] };
function wheelEntrySignature(entries: RewardWheelEntry[]) {
  return createHash("sha256").update(entries.map((entry) => `${entry.prizeId}:${entry.weight}`).join("|")).digest("hex").slice(0, 12);
}

function validVersionEntries(prizes: RewardPrize[], selectedTier: RewardSpinTier): RewardWheelEntry[] {
  return prizes
    .filter((item) => item.prizeTier === selectedTier && isPrizeActive(item))
    .sort((a, b) => a.displayOrder - b.displayOrder || a.id.localeCompare(b.id))
    .map((item) => ({ prizeId: item.id, weight: item.probabilityWeight }));
}

export function normalizeRewardWheelEntries(value: unknown): RewardWheelEntry[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((row) => {
    if (!row || typeof row !== "object") return [];
    const entry = row as Record<string, unknown>;
    const prizeId = String(entry.prizeId ?? "").trim();
    const probabilityUnits = Number(entry.probabilityUnits);
    const weight = Number(entry.weight ?? probabilityUnits);
    return prizeId && Number.isFinite(weight) && weight > 0
      ? [{ prizeId, weight, ...(Number.isInteger(probabilityUnits) && probabilityUnits > 0 ? { probabilityUnits } : {}) }]
      : [];
  });
}

export function rewardWheelEntriesAsProbabilityUnits(entries: RewardWheelEntry[]): RewardWheelProbabilityEntry[] {
  const normalized = normalizeRewardWheelEntries(entries);
  if (normalized.length && normalized.every((entry) => Number.isInteger(entry.probabilityUnits) && Number(entry.probabilityUnits) > 0)) {
    return normalized.map((entry) => ({ prizeId: entry.prizeId, probabilityUnits: Number(entry.probabilityUnits) }));
  }
  return probabilityUnitsFromRelativeWeights(normalized);
}

export async function ensureCanonicalRewardWheelConfiguration(db: Firestore) {
  const now = new Date().toISOString();
  return db.runTransaction(async (transaction) => {
    const pointerRefs = TIERS.map((selectedTier) => db.collection("rewardWheelActiveVersions").doc(selectedTier));
    const [pointerSnaps, configuredSnap, legacySnap, settingsSnap] = await Promise.all([
      Promise.all(pointerRefs.map((ref) => transaction.get(ref))),
      transaction.get(db.collection("rewardPrizes").where("enabled", "==", true).limit(500)),
      transaction.get(db.collection("rewardWheelPrizes").where("enabled", "==", true).limit(500)),
      transaction.get(db.collection("rewardSettings").doc("default")),
    ]);
    if (pointerSnaps.every((snap) => snap.exists)) return { seeded: false, migrated: false };

    const configured = configuredSnap.docs.map((doc) => normalizeRewardPrize(doc.id, doc.data()));
    const legacy = legacySnap.docs.map((doc) => normalizeRewardPrize(doc.id, doc.data()));
    const absent = configured.length === 0 && legacy.length === 0;
    if (absent) return { seeded: false, migrated: false, setupRequired: true };
    const source = configured.length ? configured : legacy;
    const sourceType = configured.length ? "configured_prizes" : "legacy_prizes";
    const configuredSettings = normalizeRewardSettings(settingsSnap.exists ? { id: settingsSnap.id, ...settingsSnap.data() } : null);

    for (let index = 0; index < TIERS.length; index += 1) {
      if (pointerSnaps[index].exists) continue;
      const selectedTier = TIERS[index];
      const entries = validVersionEntries(source, selectedTier);
      if (entries.length < 4) continue;
      const versionId = `migrated-wheel-${selectedTier}-${wheelEntrySignature(entries)}`;
      transaction.set(db.collection("rewardWheelVersions").doc(versionId), {
        id: versionId,
        tier: selectedTier,
        pointCost: configuredSettings.spinCosts[selectedTier],
        entries,
        status: "published",
        immutable: true,
        source: sourceType,
        publishedAt: now,
        createdAt: now,
        updatedAt: now,
      });
      transaction.set(pointerRefs[index], { tier: selectedTier, versionId, activatedAt: now, source: sourceType });
      transaction.set(db.collection("rewardAuditLogs").doc(deterministicId("reward_wheel_activation", versionId)), {
        id: deterministicId("reward_wheel_activation", versionId),
        action: "reward_wheel_existing_config_versioned",
        wheelVersionId: versionId,
        tier: selectedTier,
        source: sourceType,
        createdAt: now,
      });
    }
    transaction.set(db.collection("rewardMigrations").doc("canonical-wheel-versioning-v1"), {
      id: "canonical-wheel-versioning-v1",
      status: "existing_configuration_versioned",
      source: sourceType,
      completedAt: now,
      updatedAt: now,
    }, { merge: true });
    return { seeded: false, migrated: true, setupRequired: false };
  });
}

export function normalizeRewardSettings(data?: Record<string, unknown> | null): RewardSettings { const raw = data?.tierEnabled && typeof data.tierEnabled === "object" ? data.tierEnabled as Record<string, unknown> : {}; return { ...DEFAULT_REWARD_SETTINGS, id: String(data?.id ?? "default"), rewardsEnabled: data?.rewardsEnabled !== false, maintenanceMode: Boolean(data?.maintenanceMode), rewardEarningPaused: Boolean(data?.rewardEarningPaused), rewardFulfillmentPaused: Boolean(data?.rewardFulfillmentPaused), tierEnabled: { basic: raw.basic !== false, standard: raw.standard !== false, premium: raw.premium !== false }, thresholds: REWARD_WHEEL_POINT_COSTS, spinCosts: REWARD_WHEEL_POINT_COSTS, animationDurationMs: n(data?.animationDurationMs, 4200), resultDisplayDurationMs: n(data?.resultDisplayDurationMs, 7000), primaryCampaignId: typeof data?.primaryCampaignId === "string" && data.primaryCampaignId ? data.primaryCampaignId : null, publicWheelRules: String(data?.publicWheelRules ?? DEFAULT_REWARD_SETTINGS.publicWheelRules), campaignTerms: String(data?.campaignTerms ?? DEFAULT_REWARD_SETTINGS.campaignTerms), supportContact: String(data?.supportContact ?? DEFAULT_REWARD_SETTINGS.supportContact), emailVerificationRequired: Boolean(data?.emailVerificationRequired), phoneVerificationRequired: Boolean(data?.phoneVerificationRequired), addressVerificationRequiredForPhysicalPrizes: data?.addressVerificationRequiredForPhysicalPrizes !== false, minimumAccountAgeDays: n(data?.minimumAccountAgeDays), updatedAt: iso(data?.updatedAt) }; }
export async function getRewardSettings(db: Firestore) { const snap = await db.collection("rewardSettings").doc("default").get(); return normalizeRewardSettings(snap.exists ? { id: snap.id, ...snap.data() } : null); }
export function normalizeRewardCampaign(id: string, data?: Record<string, unknown> | null): RewardCampaign { if (!data) return DEFAULT_REWARD_CAMPAIGN; return { id, campaignName: String(data.campaignName ?? data.name ?? "Rewards Campaign"), description: String(data.description ?? ""), active: data.active !== false, primary: Boolean(data.primary), startDate: iso(data.startDate), endDate: iso(data.endDate), associatedWheelTiers: Array.isArray(data.associatedWheelTiers) ? data.associatedWheelTiers.map(tier) : TIERS, bannerImageUrl: typeof data.bannerImageUrl === "string" ? data.bannerImageUrl : null, terms: String(data.terms ?? DEFAULT_REWARD_SETTINGS.campaignTerms), eligibleCountries: Array.isArray(data.eligibleCountries) ? data.eligibleCountries.map(String) : [], eligiblePlans: Array.isArray(data.eligiblePlans) ? data.eligiblePlans.map(String) : [] }; }
export async function getActiveRewardCampaign(db: Firestore, settings?: RewardSettings) { if (settings?.primaryCampaignId) { const snap = await db.collection("rewardCampaigns").doc(settings.primaryCampaignId).get(); if (snap.exists) return normalizeRewardCampaign(snap.id, snap.data()); } const snap = await db.collection("rewardCampaigns").where("active", "==", true).limit(25).get(); const campaigns = snap.docs.map((doc) => normalizeRewardCampaign(doc.id, doc.data())); return campaigns.find((item) => item.primary) ?? campaigns[0] ?? DEFAULT_REWARD_CAMPAIGN; }
export function normalizeRewardPrize(id: string, data: Record<string, unknown>): RewardPrize { const rawType = String(data.prizeType ?? data.rewardType ?? "reward_points"); const prizeType = rawType === "physical_reward" || rawType === "manual_prize" ? "physical_item" : rawType; const manual = data.manualFulfillmentRequired === true || data.fulfillmentType === "manual" || ["physical_item", "gift_card"].includes(prizeType); return { id, prizeName: String(data.prizeName ?? data.name ?? "Reward Prize"), prizeDescription: String(data.prizeDescription ?? data.description ?? ""), prizeTier: tier(data.prizeTier ?? data.tier), prizeType, rarity: rarity(data.rarity), fulfillmentType: manual ? "manual" : "automatic", probabilityWeight: Math.max(0, Number(data.probabilityWeight ?? data.weight ?? 1)), quantityType: data.quantityType === "limited" ? "limited" : "unlimited", totalQuantity: maybeNumber(data.totalQuantity ?? data.quantity), remainingQuantity: maybeNumber(data.remainingQuantity ?? data.quantity), reservedQuantity: n(data.reservedQuantity), maximumWinsPerUser: maybeNumber(data.maximumWinsPerUser), maximumWinsPerDay: maybeNumber(data.maximumWinsPerDay), enabled: data.enabled !== false, status: String(data.status ?? "active"), startDate: iso(data.startDate), endDate: iso(data.endDate), expiresAt: iso(data.expiresAt), entitlementExpiresAt: iso(data.entitlementExpiresAt), displayOrder: Number(data.displayOrder ?? 0), terms: String(data.terms ?? "Rewards are subject to the configured fulfillment terms."), campaignId: typeof data.campaignId === "string" ? data.campaignId : null, imageUrl: typeof data.imageUrl === "string" ? data.imageUrl : null, rewardValue: Number(data.rewardValue ?? data.value ?? 0), maximumDiscountCents: maybeNumber(data.maximumDiscountCents), unit: typeof data.unit === "string" ? data.unit : null, currency: prizeType === "cash" ? "USD" : null, economicValueCents: n(data.economicValueCents ?? (prizeType === "cash" ? data.rewardValue ?? data.value : 0)), budgetId: typeof data.budgetId === "string" && data.budgetId ? data.budgetId : null, manualFulfillmentRequired: manual, fulfillmentInstructions: typeof data.fulfillmentInstructions === "string" ? data.fulfillmentInstructions : null, brand: typeof data.brand === "string" ? data.brand : null, model: typeof data.model === "string" ? data.model : null, variant: typeof data.variant === "string" ? data.variant : null, sku: typeof data.sku === "string" ? data.sku : null, deliveryCountries: Array.isArray(data.deliveryCountries) ? data.deliveryCountries.map(String).map((value) => value.toUpperCase()) : [], shippingPolicy: typeof data.shippingPolicy === "string" ? data.shippingPolicy : null, customsPolicy: typeof data.customsPolicy === "string" ? data.customsPolicy : null, deliveryDetailsDeadlineDays: n(data.deliveryDetailsDeadlineDays, 14) || 14, estimatedFulfillmentDays: maybeNumber(data.estimatedFulfillmentDays), createdByAdminId: typeof data.createdByAdminId === "string" ? data.createdByAdminId : null, winCount: n(data.winCount), cashOutEnabled: false }; }
export function isPrizeActive(item: RewardPrize, now = Date.now(), campaignId?: string | null) { if (!(SUPPORTED_SPIN_REWARD_TYPES as readonly string[]).includes(item.prizeType) || !item.enabled || item.status !== "active" || item.probabilityWeight <= 0 || item.rewardValue <= 0) return false; if (campaignId && item.campaignId && item.campaignId !== campaignId) return false; if (item.startDate && Date.parse(item.startDate) > now) return false; const end = item.endDate ?? item.expiresAt; if (end && Date.parse(end) <= now) return false; return item.quantityType !== "limited" || (item.remainingQuantity ?? 0) > 0; }
function prizeDeliveryEligible(item: RewardPrize, country?: string | null) { if (item.prizeType !== "physical_item") return true; if (!item.deliveryCountries.length || !item.shippingPolicy || !item.customsPolicy) return false; const normalized = String(country ?? "").trim().toUpperCase(); return Boolean(normalized && item.deliveryCountries.includes(normalized)); }
export function availablePrizesForTier(prizes: RewardPrize[], selectedTier: RewardSpinTier, now = Date.now(), campaignId?: string | null, country?: string | null) { return prizes.filter((item) => item.prizeTier === selectedTier && isPrizeActive(item, now, campaignId) && prizeDeliveryEligible(item, country)).sort((a, b) => a.displayOrder - b.displayOrder || a.prizeName.localeCompare(b.prizeName)); }
export function chooseRewardPrize(prizes: RewardPrize[], selectedTier: RewardSpinTier, now = Date.now(), campaignId?: string | null, country?: string | null) { const available = availablePrizesForTier(prizes, selectedTier, now, campaignId, country); const scaled = available.map((item) => ({ item, weight: Math.max(0, Math.round(item.probabilityWeight * 1000)) })); const total = scaled.reduce((sum, item) => sum + item.weight, 0); if (!available.length || total <= 0) return null; let cursor = randomInt(total); for (const entry of scaled) { if (cursor < entry.weight) return entry.item; cursor -= entry.weight; } return available.at(-1) ?? null; }
export function rewardPrizesNeedSetup(prizes: RewardPrize[]) { return prizes.length === 0; }
export async function loadRewardPrizes(db: Firestore) { const snap = await db.collection("rewardPrizes").where("enabled", "==", true).limit(500).get(); const configured = snap.docs.map((doc) => normalizeRewardPrize(doc.id, doc.data())); if (configured.length) return configured; const legacy = await db.collection("rewardWheelPrizes").where("enabled", "==", true).limit(500).get(); return legacy.docs.map((doc) => normalizeRewardPrize(doc.id, doc.data())); }
export async function resolveRewardWheel(db: Firestore, selectedTier: RewardSpinTier, settings: RewardSettings, country?: string | null, campaignId?: string | null, configurationEnsured = false): Promise<ResolvedRewardWheel> {
  if (!configurationEnsured) await ensureCanonicalRewardWheelConfiguration(db);
  const pointerSnap = await db.collection("rewardWheelActiveVersions").doc(selectedTier).get();
  if (!pointerSnap.exists) return { tier: selectedTier, versionId: null, pointCost: REWARD_WHEEL_POINT_COSTS[selectedTier], prizes: [], diagnosticCode: "NO_ACTIVE_WHEEL_VERSION" };
  const versionId = String(pointerSnap.data()?.versionId ?? "");
  const versionSnap = versionId ? await db.collection("rewardWheelVersions").doc(versionId).get() : null;
  if (!versionSnap?.exists) return { tier: selectedTier, versionId, pointCost: REWARD_WHEEL_POINT_COSTS[selectedTier], prizes: [], diagnosticCode: "ACTIVE_WHEEL_VERSION_MISSING" };
  const entries = normalizeRewardWheelEntries(versionSnap.data()?.entries);
  if (!entries.length) return { tier: selectedTier, versionId, pointCost: REWARD_WHEEL_POINT_COSTS[selectedTier], prizes: [], diagnosticCode: "ACTIVE_WHEEL_EMPTY" };
  const resolved = await Promise.all(entries.map(async (entry) => {
    const current = await db.collection("rewardPrizes").doc(entry.prizeId).get();
    const source = current.exists ? current : await db.collection("rewardWheelPrizes").doc(entry.prizeId).get();
    if (!source.exists) return null;
    return { ...normalizeRewardPrize(source.id, source.data() ?? {}), prizeTier: selectedTier, probabilityWeight: entry.weight };
  }));
  const prizes = availablePrizesForTier(resolved.filter((item): item is RewardPrize => Boolean(item)), selectedTier, Date.now(), campaignId, country);
  return {
    tier: selectedTier,
    versionId,
    pointCost: REWARD_WHEEL_POINT_COSTS[selectedTier],
    prizes,
    diagnosticCode: prizes.length >= 4 ? null : prizes.length ? "ACTIVE_WHEEL_MINIMUM_REWARDS_NOT_MET" : "EMPTY_ELIGIBLE_REWARD_POOL",
  };
}
export function publicPrize(item: RewardPrize, resolvedProbability?: number) { return { id: item.id, prizeName: item.prizeName, prizeDescription: item.prizeDescription, prizeTier: item.prizeTier, prizeType: item.prizeType, fulfillmentType: item.fulfillmentType, imageUrl: item.imageUrl, terms: item.terms, manualFulfillmentRequired: item.manualFulfillmentRequired, displayOrder: item.displayOrder, rewardValue: item.rewardValue, maximumDiscountCents: item.maximumDiscountCents ?? null, unit: item.unit, currency: item.currency, brand: item.brand, model: item.model, variant: item.variant, deliveryCountries: item.prizeType === "physical_item" ? item.deliveryCountries : undefined, deliveryDetailsDeadlineDays: item.prizeType === "physical_item" ? item.deliveryDetailsDeadlineDays : undefined, resolvedProbability: resolvedProbability === undefined ? undefined : Number(resolvedProbability.toFixed(6)), cashOutEnabled: false }; }
export function publicPrizePool(items: RewardPrize[]) { const total = items.reduce((sum, item) => sum + item.probabilityWeight, 0); return items.map((item) => publicPrize(item, total ? item.probabilityWeight / total : 0)); }
export function publicRewardWheelConfig(wheel: ResolvedRewardWheel): PublicRewardWheelConfig | null {
  if (!wheel.versionId || wheel.prizes.length < 4) return null;
  const probabilities = probabilityUnitsFromRelativeWeights(wheel.prizes.map((item) => ({ prizeId: item.id, weight: item.probabilityWeight })));
  return {
    tier: wheel.tier,
    versionId: wheel.versionId,
    pointCost: wheel.pointCost,
    entries: probabilities.map((entry) => {
      const item = wheel.prizes.find((prizeItem) => prizeItem.id === entry.prizeId)!;
      return {
        ...entry,
        displayName: item.prizeName,
        shortLabel: item.prizeName.length > 18 ? `${item.prizeName.slice(0, 15)}...` : item.prizeName,
        prizeType: item.prizeType,
        exactProbability: entry.probabilityUnits / REWARD_WHEEL_PROBABILITY_UNITS,
        imageUrl: item.imageUrl,
        fulfillmentSummary: item.prizeType === "physical_item" ? "Delivery details are required after a confirmed win." : item.manualFulfillmentRequired ? "Claim review is required." : "Applied automatically after confirmation.",
      };
    }),
  };
}
export function tierDefinitions(settings: RewardSettings) { return TIERS.map((id) => ({ id, label: `${id[0].toUpperCase()}${id.slice(1)} Spin`, spinTier: id, pointsRequired: settings.spinCosts[id], pointCost: settings.spinCosts[id], enabled: settings.tierEnabled[id] })); }
export function rewardPointReturnRatio(prizes: RewardPrize[], selectedTier: RewardSpinTier, pointCost: number) { const pool = prizes.filter((item) => item.prizeTier === selectedTier && item.enabled && item.status !== "retired" && item.probabilityWeight > 0); const totalWeight = pool.reduce((sum, item) => sum + item.probabilityWeight, 0); const expectedPoints = totalWeight ? pool.reduce((sum, item) => sum + (item.prizeType === "reward_points" ? item.rewardValue * item.probabilityWeight / totalWeight : 0), 0) : 0; const ratio = pointCost > 0 ? expectedPoints / pointCost : Number.POSITIVE_INFINITY; return { expectedPoints, ratio, warning: ratio >= 0.85, blocked: ratio >= 1 }; }

export type RewardWheelVersionRecord = {
  id: string;
  tier: RewardSpinTier;
  pointCost: number;
  entries: RewardWheelEntry[];
  status: "draft" | "published" | "retired";
  immutable: boolean;
  reason: string | null;
  createdAt: string | null;
  updatedAt: string | null;
  publishedAt: string | null;
  revision: number;
  publishedByAdminId: string | null;
};

export function normalizeRewardWheelVersion(id: string, data?: Record<string, unknown> | null): RewardWheelVersionRecord {
  const status = data?.status === "published" || data?.status === "retired" ? data.status : "draft";
  return {
    id,
    tier: tier(data?.tier),
    pointCost: REWARD_WHEEL_POINT_COSTS[tier(data?.tier)],
    entries: normalizeRewardWheelEntries(data?.entries),
    status,
    immutable: data?.immutable === true || status === "published",
    reason: typeof data?.reason === "string" && data.reason ? data.reason : null,
    createdAt: iso(data?.createdAt),
    updatedAt: iso(data?.updatedAt),
    publishedAt: iso(data?.publishedAt),
    revision: Math.max(0, n(data?.revision)),
    publishedByAdminId: typeof data?.publishedByAdminId === "string" ? data.publishedByAdminId : null,
  };
}

export function validateRewardWheelVersionInput(prizes: RewardPrize[], input: { tier: RewardSpinTier; pointCost: number; entries: RewardWheelEntry[] }, options: { requireExactTotal?: boolean; allowEmptyDraft?: boolean } = {}) {
  const pointCost = Number(input.pointCost);
  const rawEntries = normalizeRewardWheelEntries(input.entries);
  const explicitUnits = rawEntries.length > 0 && rawEntries.every((entry) => Number.isInteger(entry.probabilityUnits) && Number(entry.probabilityUnits) > 0);
  const probabilityEntries = rewardWheelEntriesAsProbabilityUnits(rawEntries);
  const entries = probabilityEntries.map((entry) => ({ prizeId: entry.prizeId, weight: entry.probabilityUnits, probabilityUnits: entry.probabilityUnits }));
  const ids = new Set<string>();
  if (pointCost !== REWARD_WHEEL_POINT_COSTS[input.tier]) throw new Error("WHEEL_POINT_COST_LOCKED");
  if (!entries.length && !options.allowEmptyDraft) throw new Error("WHEEL_ENTRIES_REQUIRED");
  if (options.requireExactTotal && explicitUnits && entries.reduce((sum, entry) => sum + entry.probabilityUnits, 0) !== REWARD_WHEEL_PROBABILITY_UNITS) throw new Error("WHEEL_PROBABILITY_TOTAL_INVALID");
  for (const entry of entries) {
    if (ids.has(entry.prizeId)) throw new Error("WHEEL_DUPLICATE_PRIZE");
    ids.add(entry.prizeId);
    const item = prizes.find((prizeItem) => prizeItem.id === entry.prizeId);
    if (!item || item.prizeTier !== input.tier || !isPrizeActive(item)) throw new Error("WHEEL_PRIZE_UNAVAILABLE");
    if (item.prizeType === "cash" && (!item.budgetId || item.economicValueCents <= 0 || item.currency !== "USD")) throw new Error("WHEEL_CASH_BUDGET_INVALID");
    if (item.prizeType === "physical_item" && (item.quantityType !== "limited" || !item.remainingQuantity || !item.deliveryCountries.length || !item.shippingPolicy || !item.customsPolicy || !item.fulfillmentInstructions)) throw new Error("WHEEL_PHYSICAL_FULFILLMENT_INVALID");
    if (item.prizeType === "percentage_entry_discount" && !item.maximumDiscountCents) throw new Error("WHEEL_ENTRY_DISCOUNT_CAP_REQUIRED");
  }
  if (options.requireExactTotal && ids.size < 4) throw new Error("WHEEL_MINIMUM_REWARDS_REQUIRED");
  const resolved = entries.map((entry) => ({ ...prizes.find((item) => item.id === entry.prizeId)!, probabilityWeight: entry.weight }));
  const economics = rewardPointReturnRatio(resolved, input.tier, pointCost);
  return { tier: input.tier, pointCost, entries, prizes: resolved, economics };
}

export async function loadAdminRewardWheelConfiguration(db: Firestore) {
  await ensureCanonicalRewardWheelConfiguration(db);
  const [settings, prizeSnap, versionSnap, ...pointerSnaps] = await Promise.all([
    getRewardSettings(db),
    db.collection("rewardPrizes").limit(500).get(),
    db.collection("rewardWheelVersions").limit(200).get(),
    ...TIERS.map((selectedTier) => db.collection("rewardWheelActiveVersions").doc(selectedTier).get()),
  ]);
  const prizes = prizeSnap.docs.map((doc) => normalizeRewardPrize(doc.id, doc.data()));
  const versions = versionSnap.docs.map((doc) => normalizeRewardWheelVersion(doc.id, doc.data()));
  const activeVersionIds = Object.fromEntries(TIERS.map((selectedTier, index) => [selectedTier, String(pointerSnaps[index].data()?.versionId ?? "") || null]));
  return { settings, prizes, versions, activeVersionIds };
}

export async function saveRewardWheelDraft(db: Firestore, input: { adminId: string; versionId?: string | null; tier: RewardSpinTier; pointCost: number; entries: RewardWheelEntry[]; reason: string; expectedRevision?: number | null }) {
  const prizes = await loadRewardPrizes(db);
  const validated = validateRewardWheelVersionInput(prizes, input, { allowEmptyDraft: true });
  const now = new Date().toISOString();
  const versionRef = input.versionId ? db.collection("rewardWheelVersions").doc(input.versionId) : db.collection("rewardWheelVersions").doc();
  return db.runTransaction(async (transaction) => {
    const existing = await transaction.get(versionRef);
    if (existing.exists && normalizeRewardWheelVersion(existing.id, existing.data()).immutable) throw new Error("WHEEL_VERSION_IMMUTABLE");
    const currentRevision = existing.exists ? normalizeRewardWheelVersion(existing.id, existing.data()).revision : 0;
    if (existing.exists && input.expectedRevision !== null && input.expectedRevision !== undefined && input.expectedRevision !== currentRevision) throw new Error("WHEEL_DRAFT_CONFLICT");
    const version = {
      id: versionRef.id,
      tier: validated.tier,
      pointCost: validated.pointCost,
      entries: validated.entries,
      status: "draft",
      immutable: false,
      reason: input.reason.trim().slice(0, 500) || null,
      createdByAdminId: existing.data()?.createdByAdminId ?? input.adminId,
      updatedByAdminId: input.adminId,
      createdAt: existing.data()?.createdAt ?? now,
      updatedAt: now,
      publishedAt: null,
      revision: currentRevision + 1,
    };
    transaction.set(versionRef, version);
    const auditRef = db.collection("rewardAuditLogs").doc();
    transaction.create(auditRef, { id: auditRef.id, action: existing.exists ? "reward_wheel_draft_updated" : "reward_wheel_draft_created", wheelVersionId: versionRef.id, tier: validated.tier, adminId: input.adminId, createdAt: now });
    return { version: normalizeRewardWheelVersion(versionRef.id, version), economics: validated.economics };
  });
}

export async function cloneRewardWheelVersionAsDraft(db: Firestore, input: { adminId: string; sourceVersionId: string }) {
  const sourceRef = db.collection("rewardWheelVersions").doc(input.sourceVersionId);
  const draftRef = db.collection("rewardWheelVersions").doc();
  const now = new Date().toISOString();
  return db.runTransaction(async (transaction) => {
    const sourceSnap = await transaction.get(sourceRef);
    if (!sourceSnap.exists) throw new Error("WHEEL_VERSION_NOT_FOUND");
    const source = normalizeRewardWheelVersion(sourceSnap.id, sourceSnap.data());
    const entries = rewardWheelEntriesAsProbabilityUnits(source.entries).map((entry) => ({ ...entry, weight: entry.probabilityUnits }));
    const draft = { id: draftRef.id, tier: source.tier, pointCost: REWARD_WHEEL_POINT_COSTS[source.tier], entries, status: "draft", immutable: false, reason: null, sourceVersionId: source.id, revision: 1, createdByAdminId: input.adminId, updatedByAdminId: input.adminId, createdAt: now, updatedAt: now, publishedAt: null };
    transaction.create(draftRef, draft);
    const auditRef = db.collection("rewardAuditLogs").doc(deterministicId("reward_wheel_clone", draftRef.id));
    transaction.create(auditRef, { id: auditRef.id, action: "reward_wheel_version_cloned_to_draft", sourceWheelVersionId: source.id, wheelVersionId: draftRef.id, tier: source.tier, adminId: input.adminId, createdAt: now });
    return { version: normalizeRewardWheelVersion(draftRef.id, draft) };
  });
}

export async function publishRewardWheelVersion(db: Firestore, input: { adminId: string; versionId: string; reason: string; confirmation: string }) {
  if (input.confirmation !== "PUBLISH REWARD WHEEL") throw new Error("WHEEL_PUBLISH_CONFIRMATION_REQUIRED");
  if (input.reason.trim().length < 8) throw new Error("WHEEL_PUBLISH_REASON_REQUIRED");
  const versionRef = db.collection("rewardWheelVersions").doc(input.versionId);
  const now = new Date().toISOString();
  return db.runTransaction(async (transaction) => {
    const versionSnap = await transaction.get(versionRef);
    if (!versionSnap.exists) throw new Error("WHEEL_VERSION_NOT_FOUND");
    const version = normalizeRewardWheelVersion(versionSnap.id, versionSnap.data());
    const pointerRef = db.collection("rewardWheelActiveVersions").doc(version.tier);
    const pointerSnap = await transaction.get(pointerRef);
    if (version.status === "published" && pointerSnap.data()?.versionId === version.id) return { version, idempotent: true };
    if (version.immutable) throw new Error("WHEEL_VERSION_IMMUTABLE");
    const previousVersionId = typeof pointerSnap.data()?.versionId === "string" ? String(pointerSnap.data()?.versionId) : null;
    const previousVersionSnap = previousVersionId && previousVersionId !== version.id
      ? await transaction.get(db.collection("rewardWheelVersions").doc(previousVersionId))
      : null;
    const prizeSnaps = await Promise.all(version.entries.map((entry) => transaction.get(db.collection("rewardPrizes").doc(entry.prizeId))));
    const prizes = prizeSnaps.filter((snap) => snap.exists).map((snap) => normalizeRewardPrize(snap.id, snap.data() ?? {}));
    const validated = validateRewardWheelVersionInput(prizes, version, { requireExactTotal: true });
    const cashBudgets = await Promise.all(validated.prizes.filter((prizeItem) => prizeItem.prizeType === "cash").map((prizeItem) => transaction.get(db.collection("rewardBudgets").doc(prizeItem.budgetId!))));
    if (cashBudgets.some((budgetSnap, index) => !budgetSnap.exists || n(budgetSnap.data()?.remainingExposureCents) < validated.prizes.filter((prizeItem) => prizeItem.prizeType === "cash")[index].economicValueCents)) throw new Error("WHEEL_CASH_BUDGET_INVALID");
    if (validated.economics.blocked) throw new Error("WHEEL_REWARD_POINT_RETURN_BLOCKED");
    const previousEntries = previousVersionSnap?.exists ? normalizeRewardWheelVersion(previousVersionSnap.id, previousVersionSnap.data()).entries : [];
    const previousByPrize = new Map(rewardWheelEntriesAsProbabilityUnits(previousEntries).map((entry) => [entry.prizeId, entry.probabilityUnits]));
    const nextByPrize = new Map(validated.entries.map((entry) => [entry.prizeId, entry.probabilityUnits]));
    const changeSummary = {
      addedPrizeIds: [...nextByPrize.keys()].filter((prizeId) => !previousByPrize.has(prizeId)),
      removedPrizeIds: [...previousByPrize.keys()].filter((prizeId) => !nextByPrize.has(prizeId)),
      changedProbabilityPrizeIds: [...nextByPrize.keys()].filter((prizeId) => previousByPrize.has(prizeId) && previousByPrize.get(prizeId) !== nextByPrize.get(prizeId)),
      previousRewardCount: previousEntries.length,
      nextRewardCount: validated.entries.length,
    };
    transaction.set(versionRef, { entries: validated.entries, status: "published", immutable: true, reason: input.reason.trim().slice(0, 500), publishedAt: now, updatedAt: now, publishedByAdminId: input.adminId }, { merge: true });
    transaction.set(pointerRef, { tier: version.tier, versionId: version.id, activatedAt: now, activatedByAdminId: input.adminId });
    const auditRef = db.collection("rewardAuditLogs").doc(deterministicId("reward_wheel_publish", version.id));
    transaction.create(auditRef, { id: auditRef.id, action: "reward_wheel_version_published", wheelVersionId: version.id, previousWheelVersionId: previousVersionId, tier: version.tier, reason: input.reason.trim().slice(0, 500), changeSummary, adminId: input.adminId, probabilityUnitsTotal: REWARD_WHEEL_PROBABILITY_UNITS, createdAt: now });
    return { version: { ...version, entries: validated.entries, status: "published" as const, immutable: true, reason: input.reason.trim().slice(0, 500), publishedAt: now, updatedAt: now }, economics: validated.economics, idempotent: false };
  });
}

export async function buildRewardSummary(db: Firestore, userId: string) {
  const [settings, userSnap, profileSnap, accountSnap, legacySnap, historySnap, claimsSnap, streakSnap, achievementsSnap, entitlementsSnap, ledgerSnap] = await Promise.all([getRewardSettings(db), db.collection("users").doc(userId).get(), db.collection("profiles").doc(userId).get(), db.collection("rewardAccounts").doc(userId).get(), db.collection("userRewards").doc(userId).get(), db.collection("spinResults").where("userId", "==", userId).limit(50).get(), db.collection("rewardClaims").where("userId", "==", userId).limit(50).get(), db.collection("rewardStreaks").doc(userId).get(), db.collection("rewardAchievements").where("userId", "==", userId).limit(100).get(), db.collection("rewardEntitlements").where("userId", "==", userId).limit(100).get(), db.collection("rewardLedgerEntries").where("userId", "==", userId).limit(100).get()]);
  const campaign = await getActiveRewardCampaign(db, settings); const profile = { ...(profileSnap.data() ?? {}), ...(userSnap.data() ?? {}) }; const account = accountSnap.data() ?? {}; const legacy = legacySnap.data() ?? {}; const points = n(account.availablePoints ?? legacy.availableRewardPoints ?? userSnap.data()?.voterPoints); const timeZone = String(profile.timeZone ?? profile.timezone ?? "UTC"); const country = String(profile.countryCode ?? profile.country ?? "").toUpperCase(); await ensureCanonicalRewardWheelConfiguration(db); const wheels = await Promise.all(TIERS.map((selectedTier) => resolveRewardWheel(db, selectedTier, settings, country, campaign.id, true))); const today = new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date()); const activitySnap = await db.collection("rewardActivityDays").doc(deterministicId("reward_activity", userId, today)).get();
  const entitlements = entitlementsSnap.docs.map((doc) => ({ id: doc.id, ...doc.data() } as Record<string, unknown>));
  const currentStreak = n(streakSnap.data()?.currentStreak); const nextMilestone = STREAK_MILESTONES.find((item) => item.days > currentStreak) ?? null; const earnedAchievements = new Set(achievementsSnap.docs.map((doc) => String(doc.data().achievementId ?? doc.id))); const counters = account.counters && typeof account.counters === "object" ? account.counters as Record<string, unknown> : {};
  const achievementProgress = ACHIEVEMENT_CATALOG.map((item) => ({ id: item.id, current: Math.min(item.threshold, n(counters[item.counter])), target: item.threshold, points: item.points, badgeId: item.badgeId, earned: earnedAchievements.has(item.id) }));
  const entitlementHistory: Array<Record<string, unknown>> = entitlements.map((item) => ({ ...item, status: item.expiresAt && Date.parse(String(item.expiresAt)) <= Date.now() && item.status === "available" ? "expired" : item.status }));
  const availableEntitlements = entitlementHistory.filter((item) => ["available", "reserved"].includes(String(item.status)));
  return { settings, campaign, points, availableRewardPoints: points, lifetimeRewardPoints: n(account.lifetimeEarned ?? legacy.lifetimeRewardPoints), rewardDebt: n(account.rewardDebt ?? legacy.rewardDebt), tiers: wheels.map((wheel) => ({ id: wheel.tier, label: `${wheel.tier[0].toUpperCase()}${wheel.tier.slice(1)} Spin`, spinTier: wheel.tier, pointsRequired: wheel.pointCost, pointCost: wheel.pointCost, enabled: settings.tierEnabled[wheel.tier] })), spinAffordability: Object.fromEntries(wheels.map((wheel) => [wheel.tier, points >= wheel.pointCost])), prizeSetupRequired: wheels.some((wheel) => !wheel.prizes.length), wheelConfigs: Object.fromEntries(wheels.map((wheel) => [wheel.tier, publicRewardWheelConfig(wheel)])), wheelVersions: Object.fromEntries(wheels.map((wheel) => [wheel.tier, { versionId: wheel.versionId, pointCost: wheel.pointCost, diagnosticCode: wheel.diagnosticCode }])), prizes: Object.fromEntries(wheels.map((wheel) => [wheel.tier, publicPrizePool(wheel.prizes)])), history: historySnap.docs.map((doc) => ({ id: doc.id, ...doc.data() })), claims: claimsSnap.docs.map((doc) => ({ id: doc.id, ...doc.data() })), ledger: ledgerSnap.docs.map((doc) => ({ id: doc.id, ...doc.data() })), recentRewards: historySnap.docs.slice(0, 5).map((doc) => ({ id: doc.id, ...doc.data() })), streak: { current: currentStreak, longest: n(streakSnap.data()?.longestStreak), lastCheckInDay: streakSnap.data()?.lastCheckInDay ?? null, eligibleToday: activitySnap.exists, checkedInToday: streakSnap.data()?.lastCheckInDay === today, checkInAwardsPoints: false, nextMilestone }, achievements: achievementProgress, entitlements: entitlementHistory, bonusSpins: availableEntitlements.filter((item) => item.type === "bonus_spin"), accountEligibility: isConsumerRewardsEligible(profile), safety: { pointsSource: "server_confirmed_eligible_activity_only", pointsPurchasable: false, clientCanGrantPoints: false, serverSelectsPrize: true, directProviderPayoutEnabled: false, rewardSelectionExposedToBrowser: false, planBasedOdds: false } };
}

export async function awardDoroCoinPurchaseRewards(db: Firestore, input: { userId: string; coins: number; sourceId: string; eventId: string }) {
  const result = await grantRewardPointsForEvent(db, {
    userId: input.userId,
    eventType: "dorocoin_purchase",
    sourceId: input.sourceId,
    sourceEventKey: `dorocoin-purchase:${input.eventId}:${input.userId}`,
    units: n(input.coins),
    metadata: { providerEventId: input.eventId, coins: n(input.coins) },
  });
  return { pointsAwarded: result.pointsAwarded, spinCreditsAwarded: emptySpinCredits(), rewardEventId: result.eventId, skipped: result.awarded ? null : result.duplicate ? "duplicate" : result.skipped ?? "not_awarded" };
}
function entitlementType(prizeType: string): RewardEntitlementType | null { return ["free_entry", "fixed_entry_discount", "percentage_entry_discount", "creator_boost", "bonus_spin"].includes(prizeType) ? prizeType as RewardEntitlementType : null; }
function ledger(input: { id: string; userId: string; direction: "credit" | "debit"; amount: number; sourceType: string; sourceId: string; sourceEventKey: string; description: string; spinId: string; createdAt: string }) { return { ...input, currency: "REWARD_POINTS", immutable: true, withdrawable: false, cashValue: null }; }

function rewardGrantFromSpin(spinId: string, spin: Record<string, unknown>) {
  const id = deterministicId("reward_grant", spinId);
  return {
    id,
    grantId: id,
    spinId,
    userId: String(spin.userId ?? ""),
    wheelTier: String(spin.wheelTier ?? spin.prizeTier ?? "basic"),
    wheelVersionId: String(spin.wheelVersionId ?? ""),
    prizeId: String(spin.prizeId ?? ""),
    rewardDefinitionId: String(spin.prizeId ?? ""),
    rewardName: String(spin.prizeName ?? "Reward"),
    rewardNameSnapshot: String(spin.prizeName ?? "Reward"),
    rewardDescription: String(spin.prizeDescription ?? ""),
    rewardType: String(spin.prizeType ?? "reward"),
    rewardValue: n(spin.rewardValue),
    rewardValueSnapshot: n(spin.rewardValue),
    unit: typeof spin.unit === "string" ? spin.unit : null,
    currency: typeof spin.currency === "string" ? spin.currency : null,
    imageUrl: typeof spin.imageUrl === "string" ? spin.imageUrl : null,
    fulfillmentId: String(spin.fulfillmentId ?? deterministicId("reward_fulfillment", spinId)),
    fulfillmentStatus: String(spin.fulfillmentStatus ?? spin.rewardStatus ?? "confirmed"),
    sourceType: "reward_spin",
    status: "granted",
    immutable: true,
    createdAt: String(spin.createdAt ?? new Date().toISOString()),
    updatedAt: String(spin.updatedAt ?? spin.createdAt ?? new Date().toISOString()),
  };
}

async function ensureRewardGrantForConfirmedSpin(db: Firestore, spinId: string, spin: Record<string, unknown>) {
  const grant = rewardGrantFromSpin(spinId, spin);
  const ref = db.collection("rewardGrants").doc(grant.id);
  await db.runTransaction(async (transaction) => {
    const existing = await transaction.get(ref);
    if (!existing.exists) transaction.create(ref, grant);
  });
  return grant.id;
}

export async function executeRewardSpin(db: Firestore, input: { userId: string; tier: RewardSpinTier; displayedVersionId: string; idempotencyKey?: string | null; paymentSource?: "points" | "bonus_spin"; bonusEntitlementId?: string | null }) {
  const spinId = input.idempotencyKey ? deterministicId("reward_spin", input.userId, input.tier, input.idempotencyKey) : randomUUID();
  const spinRef = db.collection("spinResults").doc(spinId);
  const existingSpin = await spinRef.get();
  if (existingSpin.exists) {
    const spin = { id: existingSpin.id, ...existingSpin.data() };
    await ensureRewardGrantForConfirmedSpin(db, existingSpin.id, spin);
    return { alreadyProcessed: true, spin };
  }
  const [settings, profileSnap, userSnap] = await Promise.all([getRewardSettings(db), db.collection("profiles").doc(input.userId).get(), db.collection("users").doc(input.userId).get()]);
  const campaign = await getActiveRewardCampaign(db, settings);
  const country = String(profileSnap.data()?.countryCode ?? profileSnap.data()?.country ?? userSnap.data()?.countryCode ?? userSnap.data()?.country ?? "").trim().toUpperCase();
  const wheel = await resolveRewardWheel(db, input.tier, settings, country, campaign.id);
  if (!input.displayedVersionId || !wheel.versionId || input.displayedVersionId !== wheel.versionId) throw new Error("WHEEL_VERSION_CHANGED");
  const allPrizes = wheel.prizes;
  const prizes = wheel.prizes;
  if (prizes.length < 4) throw new Error("WHEEL_MINIMUM_REWARDS_REQUIRED");
  const selected = chooseRewardPrize(prizes, input.tier, Date.now(), campaign.id, country);
  if (!selected) throw new Error("NO_AVAILABLE_PRIZES");
  if (rewardPointReturnRatio(prizes, input.tier, wheel.pointCost).blocked) throw new Error("REWARD_POINT_RETURN_RATIO_BLOCKED");
  const selectedConfiguredSnap = await db.collection("rewardPrizes").doc(selected.id).get(); const selectedCollection = selectedConfiguredSnap.exists ? "rewardPrizes" : "rewardWheelPrizes"; const now = new Date().toISOString(); const paymentSource = input.paymentSource === "bonus_spin" ? "bonus_spin" : "points"; const versionId = wheel.versionId ?? `unavailable-${input.tier}`; const winDay = now.slice(0, 10); const userWinRef = db.collection("rewardPrizeUserWins").doc(deterministicId("reward_prize_user_wins", selected.id, input.userId)); const dailyWinRef = db.collection("rewardPrizeDailyWins").doc(deterministicId("reward_prize_daily_wins", selected.id, winDay));
  const result = await db.runTransaction(async (transaction) => {
    const accountRef = db.collection("rewardAccounts").doc(input.userId); const legacyRef = db.collection("userRewards").doc(input.userId); const userRef = db.collection("users").doc(input.userId); const profileRef = db.collection("profiles").doc(input.userId); const prizeRef = db.collection(selectedCollection).doc(selected.id); const budgetRef = selected.budgetId ? db.collection("rewardBudgets").doc(selected.budgetId) : null; const bonusRef = paymentSource === "bonus_spin" && input.bonusEntitlementId ? db.collection("rewardEntitlements").doc(input.bonusEntitlementId) : null; const wheelPointerRef = db.collection("rewardWheelActiveVersions").doc(input.tier); const wheelVersionRef = db.collection("rewardWheelVersions").doc(versionId);
    const [existing, accountSnap, legacySnap, userSnap, profileSnap, prizeSnap, budgetSnap, bonusSnap, userWinSnap, dailyWinSnap, wheelPointerSnap, wheelVersionSnap] = await Promise.all([transaction.get(spinRef), transaction.get(accountRef), transaction.get(legacyRef), transaction.get(userRef), transaction.get(profileRef), prizeRef ? transaction.get(prizeRef) : Promise.resolve(null), budgetRef ? transaction.get(budgetRef) : Promise.resolve(null), bonusRef ? transaction.get(bonusRef) : Promise.resolve(null), transaction.get(userWinRef), transaction.get(dailyWinRef), transaction.get(wheelPointerRef), transaction.get(wheelVersionRef)]);
    if (existing.exists) return { alreadyProcessed: true, spin: { id: existing.id, ...existing.data() } };
    if (!settings.rewardsEnabled || settings.maintenanceMode) throw new Error("REWARDS_DISABLED"); if (settings.rewardFulfillmentPaused) throw new Error("REWARD_FULFILLMENT_PAUSED"); if (!settings.tierEnabled[input.tier]) throw new Error("WHEEL_DISABLED"); if (!wheel.versionId || input.displayedVersionId !== versionId || !wheelPointerSnap.exists || wheelPointerSnap.data()?.versionId !== versionId || !wheelVersionSnap.exists) throw new Error("WHEEL_VERSION_CHANGED"); const eligibility = isConsumerRewardsEligible({ ...(profileSnap.data() ?? {}), ...(userSnap.data() ?? {}) }); if (!eligibility.eligible) throw new Error(eligibility.restricted ? "REWARDS_ACCOUNT_RESTRICTED" : "REWARDS_ACCOUNT_NOT_ELIGIBLE");
    const account = accountSnap.data() ?? {}; const legacy = legacySnap.data() ?? {}; const previousPoints = n(account.availablePoints ?? legacy.availableRewardPoints ?? userSnap.data()?.voterPoints); if (n(account.rewardDebt ?? legacy.rewardDebt)) throw new Error("REWARD_DEBT_ACTIVE"); const pointCost = wheel.pointCost; if (paymentSource === "points" && previousPoints < pointCost) throw new Error("INSUFFICIENT_REWARD_POINTS");
    if (paymentSource === "bonus_spin") { if (!bonusSnap?.exists || bonusSnap.data()?.userId !== input.userId || bonusSnap.data()?.type !== "bonus_spin" || bonusSnap.data()?.status !== "available") throw new Error("BONUS_SPIN_UNAVAILABLE"); if (bonusSnap.data()?.tier && bonusSnap.data()?.tier !== input.tier) throw new Error("BONUS_SPIN_TIER_MISMATCH"); if (bonusSnap.data()?.expiresAt && Date.parse(String(bonusSnap.data()?.expiresAt)) <= Date.now()) throw new Error("BONUS_SPIN_EXPIRED"); }
    let selectedPrize = selected; if (prizeRef) { if (!prizeSnap?.exists) throw new Error("PRIZE_NOT_FOUND"); selectedPrize = normalizeRewardPrize(prizeSnap.id, prizeSnap.data() ?? {}); if (!isPrizeActive(selectedPrize, Date.now(), campaign.id) || !prizeDeliveryEligible(selectedPrize, country)) throw new Error("PRIZE_UNAVAILABLE"); if (selectedPrize.quantityType === "limited") { const remaining = n(selectedPrize.remainingQuantity); if (!remaining) throw new Error("PRIZE_OUT_OF_STOCK"); transaction.set(prizeRef, { remainingQuantity: remaining - 1, reservedQuantity: FieldValue.increment(1), winCount: selectedPrize.winCount + 1, updatedAt: now }, { merge: true }); } else transaction.set(prizeRef, { winCount: selectedPrize.winCount + 1, updatedAt: now }, { merge: true }); }
    const userWins = n(userWinSnap.data()?.wins); const dailyWins = n(dailyWinSnap.data()?.wins); if (selectedPrize.maximumWinsPerUser && userWins >= selectedPrize.maximumWinsPerUser) throw new Error("PRIZE_USER_WIN_LIMIT_REACHED"); if (selectedPrize.maximumWinsPerDay && dailyWins >= selectedPrize.maximumWinsPerDay) throw new Error("PRIZE_DAILY_WIN_LIMIT_REACHED"); transaction.set(userWinRef, { prizeId: selectedPrize.id, userId: input.userId, wins: userWins + 1, updatedAt: now }, { merge: true }); transaction.set(dailyWinRef, { prizeId: selectedPrize.id, day: winDay, wins: dailyWins + 1, updatedAt: now }, { merge: true });
    if (budgetRef) { if (!budgetSnap?.exists) throw new Error("REWARD_BUDGET_NOT_FOUND"); const remaining = n(budgetSnap.data()?.remainingExposureCents); if (remaining < selectedPrize.economicValueCents) throw new Error("REWARD_BUDGET_EXHAUSTED"); transaction.set(budgetRef, { remainingExposureCents: remaining - selectedPrize.economicValueCents, reservedExposureCents: FieldValue.increment(selectedPrize.economicValueCents), updatedAt: now }, { merge: true }); }
    const rewardPointPrize = selectedPrize.prizeType === "reward_points" ? n(selectedPrize.rewardValue) : 0; const debit = paymentSource === "points" ? pointCost : 0; const nextPoints = previousPoints - debit + rewardPointPrize;
    for (const [kind, direction, value, sourceType, description] of [["cost", "debit", debit, "spin_cost", `${input.tier} Spin cost.`], ["prize", "credit", rewardPointPrize, "spin_reward", selectedPrize.prizeName]] as const) { if (!value) continue; const id = deterministicId("reward_ledger", spinId, kind); const record = ledger({ id, userId: input.userId, direction, amount: value, sourceType, sourceId: kind === "cost" ? spinId : selectedPrize.id, sourceEventKey: `spin-${kind}:${spinId}`, description, spinId, createdAt: now }); transaction.create(db.collection("rewardLedgerEntries").doc(id), record); transaction.create(accountRef.collection("ledger").doc(id), record); }
    if (bonusRef) transaction.set(bonusRef, { status: "consumed", consumedAt: now, consumedBySpinId: spinId, updatedAt: now }, { merge: true });
    const fulfillmentId = deterministicId("reward_fulfillment", spinId); const rewardGrantId = deterministicId("reward_grant", spinId); const fulfillmentStatus = selectedPrize.prizeType === "physical_item" ? "delivery_details_required" : selectedPrize.manualFulfillmentRequired ? "awaiting_claim" : selectedPrize.prizeType === "cash" ? "pending_review" : "fulfilled"; const probabilitySnapshot = { versionId, prizeId: selectedPrize.id, prizeWeight: selectedPrize.probabilityWeight, activePrizeCount: prizes.length, totalWeight: prizes.reduce((sum, item) => sum + item.probabilityWeight, 0), eligiblePrizeIds: prizes.map((item) => item.id) }; const spin = { id: spinId, userId: input.userId, wheelTier: input.tier, pointCost: debit, paymentSource, campaignId: campaign.id, wheelVersionId: versionId, prizeId: selectedPrize.id, prizeName: selectedPrize.prizeName, prizeDescription: selectedPrize.prizeDescription, prizeType: selectedPrize.prizeType, prizeTier: selectedPrize.prizeTier, imageUrl: selectedPrize.imageUrl, rewardValue: selectedPrize.rewardValue, unit: selectedPrize.unit, maximumDiscountCents: selectedPrize.maximumDiscountCents ?? null, entitlementExpiresAt: selectedPrize.entitlementExpiresAt, currency: selectedPrize.currency, status: "confirmed", spinStatus: "confirmed", rewardStatus: fulfillmentStatus, fulfillmentStatus, fulfillmentId, rewardGrantId, manualFulfillmentRequired: selectedPrize.manualFulfillmentRequired, serverSelected: true, idempotencyKey: input.idempotencyKey ?? null, probabilitySnapshot, inventoryReservationId: selectedPrize.quantityType === "limited" ? deterministicId("reward_inventory", spinId) : null, budgetReservationId: budgetRef ? deterministicId("reward_budget", spinId) : null, cashOutEnabled: false, externalPayoutExecuted: false, createdAt: now, updatedAt: now };
    transaction.set(accountRef, { userId: input.userId, availablePoints: nextPoints, lifetimeEarned: n(account.lifetimeEarned) + rewardPointPrize, lifetimeSpent: n(account.lifetimeSpent) + debit, updatedAt: now, createdAt: account.createdAt ?? now }, { merge: true }); transaction.set(legacyRef, { userId: input.userId, availableRewardPoints: nextPoints, lifetimeRewardPoints: n(legacy.lifetimeRewardPoints) + rewardPointPrize, updatedAt: now }, { merge: true }); transaction.set(userRef, { voterPoints: nextPoints, updatedAt: now }, { merge: true }); transaction.create(spinRef, spin); transaction.create(db.collection("rewardSpinHistory").doc(spinId), spin); transaction.create(accountRef.collection("spinHistory").doc(spinId), spin); transaction.create(db.collection("rewardGrants").doc(rewardGrantId), { id: rewardGrantId, grantId: rewardGrantId, spinId, userId: input.userId, wheelTier: input.tier, wheelVersionId: versionId, prizeId: selectedPrize.id, rewardDefinitionId: selectedPrize.id, rewardName: selectedPrize.prizeName, rewardNameSnapshot: selectedPrize.prizeName, rewardDescription: selectedPrize.prizeDescription, rewardType: selectedPrize.prizeType, rewardValue: selectedPrize.rewardValue, rewardValueSnapshot: selectedPrize.rewardValue, unit: selectedPrize.unit, currency: selectedPrize.currency, imageUrl: selectedPrize.imageUrl, fulfillmentId, fulfillmentStatus, sourceType: "reward_spin", status: "granted", immutable: true, createdAt: now, updatedAt: now });
    if (selectedPrize.prizeType === "dorocoin") { const walletRef = db.collection("doroCoinWallets").doc(input.userId); const coinRef = db.collection("doroCoinTransactions").doc(deterministicId("reward_dorocoin", spinId)); transaction.set(walletRef, { userId: input.userId, balance: FieldValue.increment(selectedPrize.rewardValue), withdrawable: false, updatedAt: now }, { merge: true }); transaction.create(coinRef, { id: coinRef.id, userId: input.userId, amount: selectedPrize.rewardValue, signedAmount: selectedPrize.rewardValue, direction: "credit", type: "reward", sourceType: "reward_spin", sourceId: spinId, description: selectedPrize.prizeName, immutable: true, withdrawable: false, cashOutEnabled: false, createdAt: now }); }
    if (selectedPrize.prizeType === "cash") { const amountCents = n(selectedPrize.rewardValue); const cashId = deterministicId("reward_cash", spinId); transaction.create(db.collection("cashLedger").doc(cashId), { id: cashId, walletCreditId: cashId, userId: input.userId, sourceType: "reward_spin_cash", sourceId: spinId, spinId, prizeId: selectedPrize.id, type: "internal_reward_credit", direction: "credit", grossAmountCents: amountCents, feeRate: 0, feeAmountCents: 0, netAmountCents: amountCents, amountCents, currency: "USD", status: "pending_review", balanceBucket: "pending", pendingReviewAt: now, availableAt: null, idempotencyKey: cashId, payoutProviderCalled: false, externalPayoutExecuted: false, paid: false, withdrawn: false, createdBy: "reward_spin", createdAt: now, updatedAt: now }); transaction.set(db.collection("cashWallets").doc(input.userId), { userId: input.userId, status: "review_only", currency: "USD", pendingBalanceCents: FieldValue.increment(amountCents), lifetimeEarningsCents: FieldValue.increment(amountCents), withdrawalsEnabled: false, payoutProviderConnected: false, updatedAt: now }, { merge: true }); }
    const type = entitlementType(selectedPrize.prizeType); if (type) { const id = deterministicId("reward_entitlement", spinId, type); transaction.create(db.collection("rewardEntitlements").doc(id), rewardEntitlementPayload({ id, userId: input.userId, type, sourceId: spinId, value: selectedPrize.rewardValue, unit: selectedPrize.unit ?? undefined, tier: type === "bonus_spin" ? input.tier : undefined, maximumFeeCents: type === "free_entry" ? selectedPrize.rewardValue : type === "percentage_entry_discount" ? selectedPrize.maximumDiscountCents : null, expiresAt: selectedPrize.entitlementExpiresAt, metadata: {}, now })); if (type === "badge") transaction.set(db.collection("userBadges").doc(deterministicId("reward_badge", input.userId, selectedPrize.id)), { id: deterministicId("reward_badge", input.userId, selectedPrize.id), userId: input.userId, badgeId: selectedPrize.id, source: "rewards", sourceId: spinId, status: "earned", displayPublicly: false, earnedAt: now, createdAt: now, updatedAt: now }, { merge: true }); }
    const deliveryDetailsDueAt = selectedPrize.prizeType === "physical_item" ? new Date(Date.parse(now) + selectedPrize.deliveryDetailsDeadlineDays * 86_400_000).toISOString() : null; const fulfillment = { id: fulfillmentId, rewardGrantId, spinId, userId: input.userId, prizeId: selectedPrize.id, prizeType: selectedPrize.prizeType, status: fulfillmentStatus, attemptCount: selectedPrize.manualFulfillmentRequired ? 0 : 1, nextAttemptAt: null, lastErrorCode: null, replacementPrizeId: null, refundedPointCost: 0, deliveryDetailsDueAt, externalPayoutExecuted: false, createdAt: now, updatedAt: now }; transaction.create(db.collection("rewardFulfillments").doc(fulfillmentId), fulfillment); transaction.create(db.collection("rewardFulfilments").doc(fulfillmentId), fulfillment); if (selectedPrize.manualFulfillmentRequired) transaction.create(db.collection("rewardClaims").doc(spinId), { id: spinId, fulfillmentId, spinId, userId: input.userId, prizeId: selectedPrize.id, prizeName: selectedPrize.prizeName, prizeType: selectedPrize.prizeType, status: fulfillmentStatus, claimStatus: fulfillmentStatus, fulfillmentStatus, deliveryDetailsDueAt, deliveryCountries: selectedPrize.deliveryCountries, createdAt: now, updatedAt: now }); const auditId = deterministicId("reward_spin_audit", spinId); transaction.create(db.collection("rewardAuditLogs").doc(auditId), { id: auditId, userId: input.userId, spinId, action: "reward_spin_confirmed", tier: input.tier, pointCost: debit, paymentSource, prizeId: selectedPrize.id, wheelVersionId: versionId, serverSelected: true, cashOutEnabled: false, externalPayoutExecuted: false, createdAt: now }); return { alreadyProcessed: false, spin };
  });
  const resultPrizeId = String((result.spin as Record<string, unknown>).prizeId ?? "");
  const resultPrize = allPrizes.find((item) => item.id === resultPrizeId) ?? selected;
  return { ...result, spin: { ...result.spin, prize: publicPrize(resultPrize) }, settings, campaign };
}

export async function createRewardClaim(db: Firestore, input: { userId: string; claimId: string; legalName: string; email: string; phone?: string; country?: string; stateRegion?: string; city?: string; addressLine1?: string; addressLine2?: string; postalCode?: string; deliveryNotes?: string; termsAccepted: boolean }) { if (!input.termsAccepted) throw new Error("TERMS_REQUIRED"); const now = new Date().toISOString(); const ref = db.collection("rewardClaims").doc(input.claimId); return db.runTransaction(async (transaction) => { const snap = await transaction.get(ref); if (!snap.exists) throw new Error("CLAIM_NOT_FOUND"); const claim = snap.data() ?? {}; if (claim.userId !== input.userId) throw new Error("CLAIM_FORBIDDEN"); if (!["awaiting_claim", "delivery_details_required", "claim_rejected"].includes(String(claim.claimStatus ?? claim.status))) throw new Error("CLAIM_ALREADY_SUBMITTED"); const country = String(input.country ?? "").trim().toUpperCase(); const allowedCountries = Array.isArray(claim.deliveryCountries) ? claim.deliveryCountries.map(String) : []; if (claim.prizeType === "physical_item" && (!country || !allowedCountries.includes(country))) throw new Error("DELIVERY_COUNTRY_NOT_ELIGIBLE"); if (claim.deliveryDetailsDueAt && Date.parse(String(claim.deliveryDetailsDueAt)) <= Date.now()) throw new Error("DELIVERY_DETAILS_EXPIRED"); const payload = { claimStatus: "claim_submitted", status: "claim_submitted", fulfillmentStatus: "claim_under_review", legalName: input.legalName.trim().slice(0, 120), email: input.email.trim().slice(0, 180), phone: input.phone?.trim().slice(0, 60) ?? null, country, stateRegion: input.stateRegion?.trim().slice(0, 120) ?? null, city: input.city?.trim().slice(0, 120) ?? null, addressLine1: input.addressLine1?.trim().slice(0, 240) ?? null, addressLine2: input.addressLine2?.trim().slice(0, 240) ?? null, postalCode: input.postalCode?.trim().slice(0, 40) ?? null, deliveryNotes: input.deliveryNotes?.trim().slice(0, 500) ?? null, termsAccepted: true, submittedAt: now, updatedAt: now, claimReference: `CS-${input.claimId.slice(0, 8).toUpperCase()}` }; transaction.set(ref, payload, { merge: true }); const fulfillmentId = String(claim.fulfillmentId ?? input.claimId); transaction.set(db.collection("rewardFulfilments").doc(fulfillmentId), payload, { merge: true }); transaction.set(db.collection("rewardFulfillments").doc(fulfillmentId), payload, { merge: true }); transaction.create(db.collection("rewardAuditLogs").doc(deterministicId("reward_claim", input.claimId)), { id: deterministicId("reward_claim", input.claimId), userId: input.userId, claimId: input.claimId, action: "reward_claim_submitted", createdAt: now }); return { id: input.claimId, ...claim, ...payload }; }); }
export function adminPrizePayload(body: Record<string, unknown>, adminId: string) { const now = new Date().toISOString(); const prizeType = String(body.prizeType ?? "reward_points"); const allowedTypes = ["reward_points", "dorocoin", "cash", "free_entry", "fixed_entry_discount", "percentage_entry_discount", "creator_boost", "bonus_spin"]; if (!allowedTypes.includes(prizeType)) throw new Error("REWARD_PRIZE_TYPE_NOT_REGISTERED"); const physical = prizeType === "physical_item"; const cash = prizeType === "cash"; const quantityType = physical || body.quantityType === "limited" ? "limited" : "unlimited"; const totalQuantity = quantityType === "limited" ? n(body.totalQuantity ?? body.quantity) : null; if (physical && !totalQuantity) throw new Error("PHYSICAL_PRIZE_INVENTORY_REQUIRED"); const deliveryCountries = Array.isArray(body.deliveryCountries) ? body.deliveryCountries.map(String).map((value) => value.trim().toUpperCase()).filter(Boolean) : []; if (physical && !deliveryCountries.length) throw new Error("PHYSICAL_PRIZE_COUNTRIES_REQUIRED"); const rewardValue = prizeType === "creator_boost" ? 3 : n(body.rewardValue); const maximumDiscountCents = prizeType === "percentage_entry_discount" ? maybeNumber(body.maximumDiscountCents) : null; if (!rewardValue) throw new Error("REWARD_PRIZE_VALUE_REQUIRED"); const fulfillmentType = physical ? "manual" : body.fulfillmentType === "manual" ? "manual" : "automatic"; return { prizeName: String(body.prizeName ?? body.name ?? "Untitled prize").slice(0, 120), prizeDescription: String(body.prizeDescription ?? body.description ?? "").slice(0, 500), prizeTier: tier(body.prizeTier ?? body.tier), prizeType, fulfillmentType, manualFulfillmentRequired: fulfillmentType === "manual", probabilityWeight: Math.max(0, Number(body.probabilityWeight ?? 1)), quantityType, totalQuantity, remainingQuantity: quantityType === "unlimited" ? null : Math.min(totalQuantity ?? 0, n(body.remainingQuantity ?? totalQuantity)), reservedQuantity: n(body.reservedQuantity), maximumWinsPerUser: maybeNumber(body.maximumWinsPerUser), maximumWinsPerDay: maybeNumber(body.maximumWinsPerDay), enabled: body.enabled !== false, status: String(body.status ?? "draft"), startDate: typeof body.startDate === "string" && body.startDate ? body.startDate : null, endDate: typeof body.endDate === "string" && body.endDate ? body.endDate : null, expiresAt: typeof body.expiresAt === "string" && body.expiresAt ? body.expiresAt : null, entitlementExpiresAt: typeof body.entitlementExpiresAt === "string" && body.entitlementExpiresAt ? body.entitlementExpiresAt : null, displayOrder: Number(body.displayOrder ?? 0), terms: String(body.terms ?? "Rewards are subject to the configured fulfillment terms.").slice(0, 2000), campaignId: typeof body.campaignId === "string" && body.campaignId ? body.campaignId : null, imageUrl: typeof body.imageUrl === "string" && body.imageUrl ? body.imageUrl : null, rewardValue, maximumDiscountCents, unit: cash ? "cents" : typeof body.unit === "string" ? body.unit.slice(0, 30) : null, currency: cash ? "USD" : null, economicValueCents: cash ? rewardValue : n(body.economicValueCents), budgetId: typeof body.budgetId === "string" && body.budgetId ? body.budgetId : null, fulfillmentInstructions: typeof body.fulfillmentInstructions === "string" ? body.fulfillmentInstructions.slice(0, 2000) : null, brand: physical && typeof body.brand === "string" ? body.brand.slice(0, 120) : null, model: physical && typeof body.model === "string" ? body.model.slice(0, 120) : null, variant: physical && typeof body.variant === "string" ? body.variant.slice(0, 120) : null, sku: physical && typeof body.sku === "string" ? body.sku.slice(0, 120) : null, deliveryCountries, shippingPolicy: physical && typeof body.shippingPolicy === "string" ? body.shippingPolicy.slice(0, 1000) : null, customsPolicy: physical && typeof body.customsPolicy === "string" ? body.customsPolicy.slice(0, 1000) : null, deliveryDetailsDeadlineDays: physical ? n(body.deliveryDetailsDeadlineDays, 14) || 14 : 14, estimatedFulfillmentDays: physical ? maybeNumber(body.estimatedFulfillmentDays) : null, updatedAt: now, createdByAdminId: adminId, cashOutEnabled: false, externalPayoutExecuted: false }; }
