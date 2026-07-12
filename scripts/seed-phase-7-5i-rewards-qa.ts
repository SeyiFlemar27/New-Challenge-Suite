import nextEnv from "@next/env";
import { cert, getApps, initializeApp } from "firebase-admin/app";
import { getFirestore, type Firestore } from "firebase-admin/firestore";

const { loadEnvConfig } = nextEnv;

const BATCH_ID = "phase_7_5i_rewards_qa";
const CREATED_FOR = "phase_7_5i_rewards_qa";
const CREATED_BY = "system_qa_seed";
const CAMPAIGN_ID = "phase_7_5i_launch_rewards_qa";
const SUPPORT_CONTACT = "support@challengesuite.com";
const TIERS = ["basic", "standard", "premium"] as const;

type RewardTier = (typeof TIERS)[number];
type SeedDoc = { collection: string; id: string; data: Record<string, unknown>; subcollections?: SeedDoc[] };

const rawArgs = process.argv.slice(2);
const apply = rawArgs.includes("--apply");
const cleanup = rawArgs.includes("--cleanup");
const userUid = rawArgs.find((arg) => arg.startsWith("--userUid="))?.split("=").slice(1).join("=").trim();

if ((apply && cleanup) || rawArgs.includes("--help")) {
  console.log([
    "Usage:",
    "  node --experimental-strip-types scripts/seed-phase-7-5i-rewards-qa.ts",
    "  node --experimental-strip-types scripts/seed-phase-7-5i-rewards-qa.ts --apply",
    "  node --experimental-strip-types scripts/seed-phase-7-5i-rewards-qa.ts --cleanup",
    "  node --experimental-strip-types scripts/seed-phase-7-5i-rewards-qa.ts --apply --userUid=<uid>",
    "",
    "--apply and --cleanup cannot be used together."
  ].join("\n"));
  process.exitCode = apply && cleanup ? 1 : 0;
}

const now = new Date();
const iso = (offsetDays = 0) => new Date(now.getTime() + offsetDays * 24 * 60 * 60 * 1000).toISOString();

function qaFields(extra: Record<string, unknown> = {}) {
  return { isQaSeed: true, qaSeedBatchId: BATCH_ID, createdFor: CREATED_FOR, createdBy: CREATED_BY, createdAt: iso(0), updatedAt: iso(0), ...extra };
}

function doc(collection: string, id: string, data: Record<string, unknown>, subcollections?: SeedDoc[]): SeedDoc {
  return { collection, id, data, subcollections };
}

function rewardSettingsDoc(): SeedDoc {
  return doc("rewardSettings", "default", {
    id: "default",
    rewardsEnabled: true,
    maintenanceMode: false,
    tierEnabled: { basic: true, standard: true, premium: true },
    thresholds: { basic: 100, standard: 250, premium: 500 },
    pointsPerDoroCoin: 1,
    pointsAccumulate: true,
    maxSpinsPerDay: 3,
    maxSpinsPerUser: 10,
    spinCreditExpiryDays: null,
    rewardPointExpiryDays: null,
    animationDurationMs: 4200,
    resultDisplayDurationMs: 7000,
    primaryCampaignId: CAMPAIGN_ID,
    publicWheelRules: "QA rewards campaign for controlled testing only. Reward points come only from server-confirmed DoroCoin purchases. Rewards cannot be withdrawn as cash.",
    campaignTerms: "QA campaign for controlled rewards testing only. Manual prizes require admin review and have no cash-out value.",
    supportContact: SUPPORT_CONTACT,
    kycRequiredForHighValuePrizes: true,
    emailVerificationRequired: false,
    phoneVerificationRequired: false,
    addressVerificationRequiredForPhysicalPrizes: true,
    minimumAccountAgeDays: 0,
    updatedByAdminId: CREATED_BY,
    safetyFlags: { qaOnly: true, cashOutEnabled: false, automaticPayoutsEnabled: false, automaticRefundsEnabled: false },
    ...qaFields()
  });
}

function campaignDoc(): SeedDoc {
  return doc("rewardCampaigns", CAMPAIGN_ID, {
    id: CAMPAIGN_ID,
    campaignName: "Launch Rewards QA Campaign",
    name: "Launch Rewards QA Campaign",
    description: "QA campaign for controlled rewards Spin Wheel testing only. Replace before launch.",
    active: true,
    primary: true,
    startDate: iso(-1),
    endDate: iso(30),
    associatedWheelTiers: [...TIERS],
    bannerImageUrl: null,
    terms: "QA campaign for controlled rewards testing only. Rewards cannot be withdrawn as cash.",
    eligibleCountries: ["US"],
    eligiblePlans: ["free", "creator", "host", "enterprise"],
    createdByAdminId: CREATED_BY,
    updatedByAdminId: CREATED_BY,
    ...qaFields()
  });
}

function prizeDoc(id: string, input: { name: string; description: string; tier: RewardTier; prizeType: string; fulfillmentType: "automatic" | "manual"; probabilityWeight: number; quantityType: "limited" | "unlimited"; totalQuantity: number | null; remainingQuantity: number | null; displayOrder: number; rewardValue?: number; highValuePrize?: boolean; kycRequired?: boolean }): SeedDoc {
  const manual = input.fulfillmentType === "manual";
  return doc("rewardPrizes", id, {
    id,
    prizeName: input.name,
    name: input.name,
    prizeDescription: input.description,
    description: input.description,
    prizeTier: input.tier,
    tier: input.tier,
    prizeType: input.prizeType,
    rewardType: input.prizeType,
    fulfillmentType: input.fulfillmentType,
    fulfilmentType: input.fulfillmentType,
    manualFulfillmentRequired: manual,
    probabilityWeight: input.probabilityWeight,
    quantityType: input.quantityType,
    totalQuantity: input.totalQuantity,
    remainingQuantity: input.remainingQuantity,
    maximumWinsPerUser: input.highValuePrize ? 1 : 3,
    maximumWinsPerDay: input.highValuePrize ? 1 : 3,
    enabled: true,
    active: true,
    status: "active",
    startDate: iso(-1),
    endDate: iso(30),
    expiresAt: iso(30),
    displayOrder: input.displayOrder,
    campaignId: CAMPAIGN_ID,
    imageUrl: null,
    rewardValue: input.rewardValue ?? 0,
    terms: "QA reward prize for controlled testing only. No cash-out value. Replace with real admin-configured prizes before launch.",
    fulfillmentInstructions: manual ? "QA manual prize. Admin review and fulfillment required before any delivery action." : null,
    highValuePrize: Boolean(input.highValuePrize),
    kycRequired: Boolean(input.kycRequired),
    createdByAdminId: CREATED_BY,
    updatedByAdminId: CREATED_BY,
    winCount: 0,
    cashOutEnabled: false,
    ...qaFields()
  });
}

function prizeDocs(): SeedDoc[] {
  return [
    prizeDoc("phase_7_5i_basic_dorocoin_bonus", { name: "QA Basic - Small DoroCoin Bonus", description: "Small internal platform-credit bonus for controlled QA only. DoroCoins are not cash.", tier: "basic", prizeType: "dorocoin_bonus", fulfillmentType: "automatic", probabilityWeight: 50, quantityType: "unlimited", totalQuantity: null, remainingQuantity: null, displayOrder: 10, rewardValue: 10 }),
    prizeDoc("phase_7_5i_basic_free_vote", { name: "QA Basic - One Free Vote", description: "One QA vote credit for controlled testing only.", tier: "basic", prizeType: "free_vote", fulfillmentType: "automatic", probabilityWeight: 30, quantityType: "limited", totalQuantity: 500, remainingQuantity: 500, displayOrder: 20, rewardValue: 1 }),
    prizeDoc("phase_7_5i_basic_try_again", { name: "QA Basic - Try Again", description: "No reward on this controlled QA spin.", tier: "basic", prizeType: "try_again", fulfillmentType: "automatic", probabilityWeight: 20, quantityType: "unlimited", totalQuantity: null, remainingQuantity: null, displayOrder: 30 }),
    prizeDoc("phase_7_5i_standard_dorocoin_bonus", { name: "QA Standard - DoroCoin Bonus", description: "Standard internal platform-credit bonus for controlled QA only.", tier: "standard", prizeType: "dorocoin_bonus", fulfillmentType: "automatic", probabilityWeight: 40, quantityType: "unlimited", totalQuantity: null, remainingQuantity: null, displayOrder: 40, rewardValue: 50 }),
    prizeDoc("phase_7_5i_standard_profile_highlight", { name: "QA Standard - Profile Highlight", description: "Profile highlight foundation for controlled QA only.", tier: "standard", prizeType: "profile_highlight", fulfillmentType: "manual", probabilityWeight: 35, quantityType: "limited", totalQuantity: 100, remainingQuantity: 100, displayOrder: 50 }),
    prizeDoc("phase_7_5i_standard_sponsor_coupon", { name: "QA Standard - Sponsor Coupon", description: "Sponsor coupon manual fulfillment foundation for controlled QA only.", tier: "standard", prizeType: "sponsor_coupon", fulfillmentType: "manual", probabilityWeight: 25, quantityType: "limited", totalQuantity: 100, remainingQuantity: 100, displayOrder: 60 }),
    prizeDoc("phase_7_5i_premium_dorocoin_bonus", { name: "QA Premium - Premium DoroCoin Bonus", description: "Premium internal platform-credit bonus for controlled QA only.", tier: "premium", prizeType: "dorocoin_bonus", fulfillmentType: "automatic", probabilityWeight: 40, quantityType: "unlimited", totalQuantity: null, remainingQuantity: null, displayOrder: 70, rewardValue: 100 }),
    prizeDoc("phase_7_5i_premium_event_ticket", { name: "QA Premium - Event Ticket", description: "Manual high-value event ticket foundation for controlled QA only.", tier: "premium", prizeType: "event_ticket", fulfillmentType: "manual", probabilityWeight: 30, quantityType: "limited", totalQuantity: 25, remainingQuantity: 25, displayOrder: 80, highValuePrize: true, kycRequired: true }),
    prizeDoc("phase_7_5i_premium_merch_product", { name: "QA Premium - Merch/Product Prize", description: "Manual high-value merchandise or product prize foundation for controlled QA only.", tier: "premium", prizeType: "merch", fulfillmentType: "manual", probabilityWeight: 30, quantityType: "limited", totalQuantity: 50, remainingQuantity: 50, displayOrder: 90, highValuePrize: true, kycRequired: true })
  ];
}

function optionalUserRewardDoc(uid: string): SeedDoc {
  const pointEventId = "phase_7_5i_test_points";
  const subcollections: SeedDoc[] = [
    doc("pointTransactions", pointEventId, { id: pointEventId, userId: uid, type: "qa_reward_points_seed", sourceType: "qa_seed", sourceId: BATCH_ID, pointsAwarded: 500, previousPoints: 0, nextPoints: 500, spinCreditsAwarded: { basic: 1, standard: 1, premium: 1 }, serverConfirmed: true, clientOnlyGrant: false, cashOutEnabled: false, ...qaFields() }),
    ...TIERS.map((tier) => doc("spinCredits", `phase_7_5i_${tier}_credit`, { id: `phase_7_5i_${tier}_credit`, userId: uid, tier, sourceType: "qa_seed", sourceId: BATCH_ID, status: "available", used: false, cashOutEnabled: false, expiresAt: null, ...qaFields() }))
  ];
  return doc("userRewards", uid, { id: uid, userId: uid, status: "active", availableRewardPoints: 500, lifetimeRewardPoints: 500, spinCredits: { basic: 1, standard: 1, premium: 1 }, basicSpinCredits: 1, standardSpinCredits: 1, premiumSpinCredits: 1, rewardSpinCredits: 3, rewardSpinCreditsByTier: { basic: 1, standard: 1, premium: 1 }, voterPoints: 500, seededCreditsRequireCleanup: true, cashOutEnabled: false, ...qaFields() }, subcollections);
}

function buildSeedDocs(): SeedDoc[] {
  const docs = [rewardSettingsDoc(), campaignDoc(), ...prizeDocs()];
  if (userUid) docs.push(optionalUserRewardDoc(userUid));
  return docs;
}

function flattenDocs(docs: SeedDoc[]) {
  const flattened: Array<{ path: string; data: Record<string, unknown> }> = [];
  for (const item of docs) {
    const basePath = `${item.collection}/${item.id}`;
    flattened.push({ path: basePath, data: item.data });
    for (const child of item.subcollections ?? []) flattened.push({ path: `${basePath}/${child.collection}/${child.id}`, data: child.data });
  }
  return flattened;
}

function summarizeByCollection(docs: SeedDoc[]) {
  return flattenDocs(docs).reduce<Record<string, number>>((acc, item) => {
    const collection = item.path.split("/").filter((_, index) => index % 2 === 0).join("/");
    acc[collection] = (acc[collection] ?? 0) + 1;
    return acc;
  }, {});
}

function requiredEnv(name: string) {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required Firebase Admin environment variable: ${name}`);
  return value;
}

async function getDbForWrites() {
  loadEnvConfig(process.cwd());
  if (!getApps().length) {
    initializeApp({
      storageBucket: process.env.FIREBASE_STORAGE_BUCKET || process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
      credential: cert({
        projectId: process.env.FIREBASE_PROJECT_ID || requiredEnv("NEXT_PUBLIC_FIREBASE_PROJECT_ID"),
        clientEmail: requiredEnv("FIREBASE_CLIENT_EMAIL"),
        privateKey: requiredEnv("FIREBASE_PRIVATE_KEY").replace(/\\n/g, "\n")
      })
    });
  }
  return getFirestore();
}

function isSameQaSeed(data: Record<string, unknown> | undefined) {
  return data?.isQaSeed === true && data.qaSeedBatchId === BATCH_ID;
}

async function applySeed(db: Firestore, docs: SeedDoc[]) {
  const flattened = flattenDocs(docs);
  const refs = flattened.map((item) => db.doc(item.path));
  const existing = await db.getAll(...refs);
  existing.forEach((snap, index) => {
    if (snap.exists && !isSameQaSeed(snap.data())) {
      throw new Error(`Refusing to overwrite non-QA record at ${flattened[index].path}`);
    }
  });

  let batch = db.batch();
  let count = 0;
  for (const [index, item] of flattened.entries()) {
    batch.set(refs[index], item.data, { merge: true });
    count += 1;
    if (count % 450 === 0) {
      await batch.commit();
      batch = db.batch();
    }
  }
  if (count % 450 !== 0) await batch.commit();
  return count;
}

async function deleteQaTaggedQuery(db: Firestore, collectionPath: string) {
  const snap = await db.collection(collectionPath).where("qaSeedBatchId", "==", BATCH_ID).get();
  let deleted = 0;
  let batch = db.batch();
  let ops = 0;
  for (const found of snap.docs) {
    const data = found.data();
    if (data.isQaSeed === true && data.qaSeedBatchId === BATCH_ID) {
      batch.delete(found.ref);
      deleted += 1;
      ops += 1;
    }
    if (ops > 0 && ops % 450 === 0) {
      await batch.commit();
      batch = db.batch();
    }
  }
  if (ops % 450 !== 0) await batch.commit();
  return deleted;
}

async function cleanupSeed(db: Firestore) {
  let deleted = 0;
  deleted += await deleteQaTaggedQuery(db, "rewardCampaigns");
  deleted += await deleteQaTaggedQuery(db, "rewardPrizes");
  const settingsRef = db.collection("rewardSettings").doc("default");
  const settingsSnap = await settingsRef.get();
  const settings = settingsSnap.data();
  if (settings?.isQaSeed === true && settings.qaSeedBatchId === BATCH_ID) {
    await settingsRef.delete();
    deleted += 1;
  }
  if (userUid) {
    const userRewardRef = db.collection("userRewards").doc(userUid);
    deleted += await deleteQaTaggedQuery(db, `userRewards/${userUid}/pointTransactions`);
    deleted += await deleteQaTaggedQuery(db, `userRewards/${userUid}/spinCredits`);
    const userRewardSnap = await userRewardRef.get();
    const userReward = userRewardSnap.data();
    if (userReward?.isQaSeed === true && userReward.qaSeedBatchId === BATCH_ID) {
      await userRewardRef.delete();
      deleted += 1;
    }
  }
  return deleted;
}

async function main() {
  if (process.exitCode) return;
  const docs = buildSeedDocs();
  const flattened = flattenDocs(docs);
  const summary = { batchId: BATCH_ID, dryRun: !apply && !cleanup, apply, cleanup, userUid: userUid ? "provided" : "not_provided", recordCount: flattened.length, byCollection: summarizeByCollection(docs), records: flattened.map((item) => item.path), commands: { dryRun: "node --experimental-strip-types scripts/seed-phase-7-5i-rewards-qa.ts", apply: "node --experimental-strip-types scripts/seed-phase-7-5i-rewards-qa.ts --apply", cleanup: "node --experimental-strip-types scripts/seed-phase-7-5i-rewards-qa.ts --cleanup", optionalUserCredits: "node --experimental-strip-types scripts/seed-phase-7-5i-rewards-qa.ts --apply --userUid=<uid>" } };
  if (!apply && !cleanup) {
    console.log(JSON.stringify({ mode: "dry-run", ...summary, writesPerformed: false }, null, 2));
    return;
  }
  const db = await getDbForWrites();
  if (cleanup) {
    const deleted = await cleanupSeed(db);
    console.log(JSON.stringify({ mode: "cleanup", batchId: BATCH_ID, deleted, userUid: userUid ? "provided" : "not_provided" }, null, 2));
    return;
  }
  const written = await applySeed(db, docs);
  console.log(JSON.stringify({ mode: "apply", batchId: BATCH_ID, written, userUid: userUid ? "provided" : "not_provided" }, null, 2));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : "Seed script failed.");
  process.exit(1);
});
