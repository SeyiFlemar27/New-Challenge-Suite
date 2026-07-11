import nextEnv from "@next/env";
import { cert, getApps, initializeApp } from "firebase-admin/app";
import { getFirestore, type Firestore } from "firebase-admin/firestore";

const { loadEnvConfig } = nextEnv;
loadEnvConfig(process.cwd());

const BATCH_ID = "phase_7_4i_qa";
const CREATED_FOR = "phase_7_4i_qa";
const CREATED_BY = "admin_qa";
const now = new Date();
const iso = (offsetDays = 0) => new Date(now.getTime() + offsetDays * 24 * 60 * 60 * 1000).toISOString();
const args = new Set(process.argv.slice(2));
const apply = args.has("--apply");
const cleanup = args.has("--cleanup");
const dryRun = !apply;

const requiredAdminEnv = ["NEXT_PUBLIC_FIREBASE_PROJECT_ID", "FIREBASE_CLIENT_EMAIL", "FIREBASE_PRIVATE_KEY"] as const;
type SeedDoc = { collection: string; id: string; data: Record<string, unknown> };

function qaFields(extra: Record<string, unknown> = {}) {
  return {
    isQaSeed: true,
    qaSeedBatchId: BATCH_ID,
    createdFor: CREATED_FOR,
    createdBy: CREATED_BY,
    createdAt: iso(0),
    updatedAt: iso(0),
    ...extra
  };
}

function requiredEnv(name: (typeof requiredAdminEnv)[number]) {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required environment variable: ${name}`);
  return value;
}

function validateAdminEnv() {
  const missing = requiredAdminEnv.filter((name) => !process.env[name]);
  if (missing.length) {
    throw new Error(`Missing Firebase Admin environment variable(s): ${missing.join(", ")}. Dry run does not require credentials. Real writes require --apply and Firebase Admin env.`);
  }
}

function initializeAdmin() {
  if (getApps().length) return;
  validateAdminEnv();
  initializeApp({
    storageBucket: process.env.FIREBASE_STORAGE_BUCKET || process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
    credential: cert({
      projectId: requiredEnv("NEXT_PUBLIC_FIREBASE_PROJECT_ID"),
      clientEmail: requiredEnv("FIREBASE_CLIENT_EMAIL"),
      privateKey: requiredEnv("FIREBASE_PRIVATE_KEY").replace(/\\n/g, "\n")
    })
  });
}

function userDoc(id: string, fields: Record<string, unknown>) {
  return doc("users", id, {
    uid: id,
    id,
    email: `${id}@qa.challengesuite.test`,
    displayName: id.split("-").map((part) => part[0]?.toUpperCase() + part.slice(1)).join(" "),
    role: "user",
    accountType: "competitor",
    planId: "free",
    subscriptionStatus: "free",
    effectiveTier: { id: "free_competitor", displayName: "Free Competitor" },
    emailVerified: true,
    ...qaFields(),
    ...fields
  });
}

function profileDoc(id: string, fields: Record<string, unknown> = {}) {
  return doc("profiles", id, {
    uid: id,
    id,
    username: id.replace(/^qa-/, ""),
    displayName: String(fields.displayName ?? id),
    avatarUrl: "https://placehold.co/160x160/png?text=QA",
    publicProfile: true,
    ...qaFields(),
    ...fields
  });
}

function challengeDoc(id: string, fields: Record<string, unknown>) {
  return doc("challenges", id, {
    id,
    title: id.split("-").map((part) => part[0]?.toUpperCase() + part.slice(1)).join(" "),
    description: "Phase 7.4I QA fixture. Safe to delete with the QA batch cleanup.",
    category: "QA Test",
    visibility: "public",
    type: "public",
    status: "published",
    lifecycleStatus: "published",
    acceptedSubmissionTypes: ["image"],
    freeBasicChallenge: false,
    creatorPlanId: "creator",
    participantCount: 0,
    participants: 0,
    submissionCount: 0,
    voteCount: 0,
    startsAt: iso(3),
    endsAt: iso(14),
    votingEndsAt: iso(15),
    rules: ["QA fixture only", "No real prizes", "No payout or release execution"],
    payoutExecutionEnabled: false,
    prizeReleaseEnabled: false,
    sponsorReleaseEnabled: false,
    ...qaFields(),
    ...fields
  });
}

function participantDoc(id: string, fields: Record<string, unknown>) {
  return doc("challengeParticipants", id, {
    id,
    status: "approved",
    participantStatus: "approved",
    displayName: "QA Participant",
    username: id.toLowerCase(),
    avatarUrl: "https://placehold.co/160x160/png?text=QA",
    profilePath: `/profile/${id.toLowerCase()}`,
    ...qaFields(),
    ...fields
  });
}

function doc(collection: string, id: string, data: Record<string, unknown>): SeedDoc {
  return { collection, id, data };
}

const freeUsers = [0, 1, 2, 3].map((count) => `qa-free-${count}-challenges`);
const fixtureUsers = [
  ...freeUsers,
  "qa-paid-creator",
  "qa-paid-creator-kyc-pending",
  "qa-paid-creator-kyc-verified",
  "qa-paid-host",
  "qa-paid-host-kyc-pending",
  "qa-sponsor-not-submitted",
  "qa-sponsor-pending-review",
  "qa-sponsor-approved-unpaid",
  "qa-sponsor-approved-paid",
  "qa-admin-reviewer",
  "qa-dorocoin-rich",
  "qa-dorocoin-empty",
  "qa-reward-points",
  "qa-spin-credits",
  "qa-no-spin-credits",
  "qa-private-access",
  "qa-private-no-access"
];

function buildSeedDocs(): SeedDoc[] {
  const docs: SeedDoc[] = [];

  docs.push(doc("qaSeedBatches", BATCH_ID, {
    id: BATCH_ID,
    status: "planned",
    recordType: "phase_7_4i_fixture_batch",
    safeToDelete: true,
    ...qaFields({ recordCount: "computed_on_apply" })
  }));

  for (const id of fixtureUsers) {
    const premiumCreator = id.includes("paid-creator");
    const premiumHost = id.includes("paid-host");
    const sponsor = id.includes("sponsor");
    const admin = id.includes("admin");
    docs.push(userDoc(id, {
      role: admin ? "admin" : sponsor ? "sponsor" : premiumHost ? "host" : premiumCreator ? "creator" : "user",
      accountType: sponsor ? "sponsor" : premiumHost ? "host" : premiumCreator ? "creator" : "competitor",
      planId: premiumHost ? "host" : premiumCreator ? "creator" : sponsor ? "sponsor" : "free",
      subscriptionStatus: premiumHost || premiumCreator || id === "qa-sponsor-approved-paid" ? "active" : "free",
      admin: admin || undefined,
      kycRequired: premiumHost || premiumCreator,
      kycStatus: id.includes("kyc-verified") ? "verified" : id.includes("kyc-pending") ? "pending_review" : premiumHost || premiumCreator ? "not_started" : "not_required",
      sponsorVerificationStatus: sponsor ? sponsorStatusForUser(id) : undefined,
      sponsorPaymentStatus: sponsor ? sponsorPaymentForUser(id) : undefined,
      voterPoints: id === "qa-reward-points" ? 250 : id === "qa-spin-credits" ? 500 : 0,
      rewardSpinCredits: id === "qa-spin-credits" ? 3 : 0,
      rewardSpinCreditsByTier: id === "qa-spin-credits" ? { basic: 1, standard: 1, premium: 1 } : { basic: 0, standard: 0, premium: 0 }
    }));
    docs.push(profileDoc(id, { displayName: `Phase 7.4I ${id.replace(/^qa-/, "")}` }));
  }

  for (const [index, userId] of freeUsers.entries()) {
    for (let n = 1; n <= index; n++) {
      docs.push(challengeDoc(`qa-free-${index}-challenge-${n}`, {
        creatorId: userId,
        creatorName: `Free ${index} Challenge User`,
        title: `QA Free Basic ${index}.${n}`,
        creatorPlanId: "free",
        planId: "free",
        freeBasicChallenge: true,
        freeBasicChallengeLimit: 3,
        status: "published",
        lifecycleStatus: "published",
        visibility: "public",
        type: "public"
      }));
    }
  }

  docs.push(challengeDoc("qa-public-basic-empty", { creatorId: "qa-free-0-challenges", title: "QA Public Basic Empty", creatorPlanId: "free", freeBasicChallenge: true }));
  docs.push(challengeDoc("qa-public-100-participants", { creatorId: "qa-paid-creator", title: "QA 100 Participant Challenge", participantCount: 100, participants: 100 }));
  docs.push(challengeDoc("qa-public-approved-submissions", { creatorId: "qa-paid-creator", title: "QA Approved Submissions", submissionCount: 3 }));
  docs.push(challengeDoc("qa-private-valid", { creatorId: "qa-paid-creator", title: "QA Private Valid Invite", visibility: "private", type: "private", status: "published" }));
  docs.push(challengeDoc("qa-private-expired", { creatorId: "qa-paid-creator", title: "QA Private Expired Invite", visibility: "private", type: "private", status: "published" }));
  docs.push(challengeDoc("qa-private-disabled", { creatorId: "qa-paid-creator", title: "QA Private Disabled Invite", visibility: "private", type: "private", status: "published" }));
  docs.push(challengeDoc("qa-private-max-use", { creatorId: "qa-paid-creator", title: "QA Private Max Use Invite", visibility: "private", type: "private", status: "published" }));
  docs.push(challengeDoc("qa-prediction-eligible", { creatorId: "qa-paid-creator", title: "QA Prediction Eligible", startsAt: iso(7), predictionArenaEnabled: true }));
  docs.push(challengeDoc("qa-prediction-started", { creatorId: "qa-paid-creator", title: "QA Prediction Started Closed", startsAt: iso(-1), status: "active", predictionArenaEnabled: true }));
  docs.push(challengeDoc("qa-prediction-ended", { creatorId: "qa-paid-creator", title: "QA Prediction Ended Closed", startsAt: iso(-10), endsAt: iso(-1), status: "completed", predictionArenaEnabled: true }));
  docs.push(challengeDoc("qa-live-physical-event", { creatorId: "qa-paid-host", title: "QA Physical Live Event", competitionType: "Live Event", venueName: "QA Arena", externalLiveUrl: "https://example.test/live", externalLiveProvider: "partner_site", externalLiveStatus: "scheduled", externalLiveOpensAt: iso(5), externalLiveCtaLabel: "Watch live on partner site" }));
  docs.push(challengeDoc("qa-tournament-rounds", { creatorId: "qa-paid-host", title: "QA Tournament Rounds", competitionType: "Tournament", tournamentType: "group_stage_to_final", stages: ["Registration", "Group Stage", "Final", "Admin Review"] }));

  for (let i = 1; i <= 100; i++) {
    const id = `qa-public-100-participant-${String(i).padStart(3, "0")}`;
    docs.push(participantDoc(id, {
      challengeId: "qa-public-100-participants",
      userId: id,
      displayName: `QA Participant ${i}`,
      username: `qa-participant-${i}`,
      profilePath: `/profile/qa-participant-${i}`,
      email: null,
      phone: null,
      kycStatus: null,
      walletData: null,
      internalNotes: null,
      riskFlags: []
    }));
    docs.push(profileDoc(id, { username: `qa-participant-${i}`, displayName: `QA Participant ${i}` }));
  }

  docs.push(participantDoc("qa-private-valid-participant", { challengeId: "qa-private-valid", userId: "qa-private-access", displayName: "QA Private Access", username: "qa-private-access" }));
  docs.push(participantDoc("qa-prediction-participant-1", { challengeId: "qa-prediction-eligible", userId: "qa-private-access", displayName: "Prediction One", username: "prediction-one" }));
  docs.push(participantDoc("qa-prediction-participant-2", { challengeId: "qa-prediction-eligible", userId: "qa-dorocoin-rich", displayName: "Prediction Two", username: "prediction-two" }));

  docs.push(...inviteDocs());
  docs.push(...sponsorDocs());
  docs.push(...dorocoinPredictionRewardDocs());
  docs.push(...submissionRevenueAdDocs());

  return docs.map((item) => item.collection === "qaSeedBatches" ? { ...item, data: { ...item.data, recordCount: docs.length } } : item);
}

function sponsorStatusForUser(id: string) {
  if (id.includes("pending")) return "pending_review";
  if (id.includes("approved")) return "approved";
  if (id.includes("not-submitted")) return "not_submitted";
  return "draft";
}

function sponsorPaymentForUser(id: string) {
  if (id.includes("approved-paid")) return "active";
  if (id.includes("approved-unpaid")) return "unpaid";
  return "unpaid";
}

function inviteDocs(): SeedDoc[] {
  const base = (id: string, fields: Record<string, unknown>) => doc("privateChallengeInvites", id, {
    id,
    challengeId: String(fields.challengeId ?? "qa-private-valid"),
    inviteCode: id.replace("qa-invite-", "QA-").toUpperCase(),
    createdByUserId: "qa-paid-creator",
    maxUses: 10,
    currentUses: 0,
    enabled: true,
    expiresAt: iso(7),
    auditEventsEnabled: true,
    ...qaFields(),
    ...fields
  });
  return [
    base("qa-invite-valid", { challengeId: "qa-private-valid", inviteCode: "QA-VALID-74I", maxUses: 10, currentUses: 1, enabled: true, expiresAt: iso(7) }),
    base("qa-invite-expired", { challengeId: "qa-private-expired", inviteCode: "QA-EXPIRED-74I", expiresAt: iso(-1) }),
    base("qa-invite-disabled", { challengeId: "qa-private-disabled", inviteCode: "QA-DISABLED-74I", enabled: false }),
    base("qa-invite-max-use", { challengeId: "qa-private-max-use", inviteCode: "QA-MAX-74I", maxUses: 1, currentUses: 1 }),
    doc("privateChallengeAccess", "qa-private-access_valid", { id: "qa-private-access_valid", userId: "qa-private-access", challengeId: "qa-private-valid", inviteId: "qa-invite-valid", accessStatus: "active", grantedAt: iso(0), ...qaFields() })
  ];
}

function sponsorDocs(): SeedDoc[] {
  const states = [
    ["not-submitted", "not_submitted", "unpaid"],
    ["draft", "draft", "unpaid"],
    ["pending-review", "pending_review", "unpaid"],
    ["needs-changes", "needs_changes", "unpaid"],
    ["approved-unpaid", "approved", "unpaid"],
    ["approved-paid", "approved", "active"],
    ["rejected", "rejected", "unpaid"],
    ["suspended", "suspended", "canceled"]
  ];
  return states.map(([slug, status, payment]) => doc("sponsorProfiles", `qa-sponsor-${slug}`, {
    id: `qa-sponsor-${slug}`,
    userId: slug === "approved-paid" ? "qa-sponsor-approved-paid" : slug === "approved-unpaid" ? "qa-sponsor-approved-unpaid" : `qa-sponsor-${slug}`,
    brandName: `QA Sponsor ${slug}`,
    brandSlug: `qa-sponsor-${slug}`,
    website: "https://brand.example.test",
    normalizedWebsite: "https://brand.example.test",
    logoUrl: "https://placehold.co/240x120/png?text=QA+Logo",
    bannerUrl: "https://placehold.co/1200x360/png?text=QA+Banner",
    industry: "QA Test",
    sponsorVerificationStatus: status,
    status,
    paymentStatus: payment,
    subscriptionStatus: payment,
    adminReviewStatus: status,
    adminReviewReason: status === "needs_changes" ? "QA needs-changes fixture" : null,
    ...qaFields()
  }));
}

function dorocoinPredictionRewardDocs(): SeedDoc[] {
  return [
    doc("doroCoinWallets", "qa-dorocoin-rich", { userId: "qa-dorocoin-rich", balance: 1000, lockedBalance: 0, cashConversionEnabled: false, ...qaFields() }),
    doc("doroCoinWallets", "qa-dorocoin-empty", { userId: "qa-dorocoin-empty", balance: 0, lockedBalance: 0, cashConversionEnabled: false, ...qaFields() }),
    doc("predictionRecords", "qa-prediction-existing", { id: "qa-prediction-existing", userId: "qa-dorocoin-rich", challengeId: "qa-prediction-eligible", predictedParticipantId: "qa-prediction-participant-1", stakeAmountDorocoin: 100, platformFeeDorocoin: 7, netPoolDorocoin: 93, status: "settlement_pending", settlementRequiresAdminReview: true, cashPayoutEnabled: false, moneyMovementEnabled: false, ...qaFields() }),
    doc("predictionRecords", "qa-prediction-closed", { id: "qa-prediction-closed", userId: "qa-dorocoin-rich", challengeId: "qa-prediction-started", predictedParticipantId: "qa-prediction-participant-1", stakeAmountDorocoin: 50, platformFeeDorocoin: 3.5, netPoolDorocoin: 46.5, status: "closed", settlementRequiresAdminReview: true, cashPayoutEnabled: false, moneyMovementEnabled: false, ...qaFields() }),
    doc("rewardWheelPrizes", "qa-prize-basic", { id: "qa-prize-basic", prizeName: "QA Basic DoroCoin Bonus", description: "Basic wheel QA prize", prizeTier: "basic", prizeType: "dorocoin_bonus", quantity: 100, inventoryRemaining: 100, probabilityWeight: 50, enabled: true, manualFulfillmentRequired: false, cashOutEnabled: false, ...qaFields() }),
    doc("rewardWheelPrizes", "qa-prize-standard", { id: "qa-prize-standard", prizeName: "QA Standard Badge", description: "Standard wheel QA prize", prizeTier: "standard", prizeType: "badge", quantity: 50, inventoryRemaining: 50, probabilityWeight: 30, enabled: true, manualFulfillmentRequired: false, cashOutEnabled: false, ...qaFields() }),
    doc("rewardWheelPrizes", "qa-prize-premium", { id: "qa-prize-premium", prizeName: "QA Premium Manual Prize", description: "Premium wheel manual fulfillment fixture", prizeTier: "premium", prizeType: "manual_prize", quantity: 5, inventoryRemaining: 5, probabilityWeight: 5, enabled: true, manualFulfillmentRequired: true, fulfillmentStatus: "pending_fulfillment", cashOutEnabled: false, ...qaFields() }),
    doc("rewardSpinHistory", "qa-spin-pending-fulfillment", { id: "qa-spin-pending-fulfillment", userId: "qa-spin-credits", wheelTier: "premium", prizeId: "qa-prize-premium", prizeName: "QA Premium Manual Prize", prizeType: "manual_prize", status: "pending_admin_fulfillment", cashOutEnabled: false, manualFulfillmentRequired: true, ...qaFields() }),
    doc("voterRewardEvents", "qa-dorocoin-purchase-points", { id: "qa-dorocoin-purchase-points", userId: "qa-reward-points", sourceType: "dorocoin_purchase", pointsAwarded: 250, spinCreditsAwarded: { basic: 1, standard: 1, premium: 0 }, status: "recorded", serverConfirmed: true, clientOnlyGrant: false, ...qaFields() })
  ];
}

function submissionRevenueAdDocs(): SeedDoc[] {
  return [
    doc("submissions", "qa-approved-submission-1", { id: "qa-approved-submission-1", challengeId: "qa-public-approved-submissions", userId: "qa-private-access", displayName: "QA Approved Submitter", title: "QA Approved Submission", status: "approved", publicVisible: true, mediaUrl: "https://placehold.co/800x600/png?text=QA+Submission", moderationNotes: null, riskFlags: [], ...qaFields() }),
    doc("revenueShareLedgers", "qa-revenue-share-ledger", { id: "qa-revenue-share-ledger", challengeId: "qa-prediction-eligible", initialPrizePoolCents: 100000, initialPrizePoolWinnerShareCents: 100000, generatedRevenueCents: 1000000, winnersShareCents: 650000, hostShareCents: 150000, sponsorShareCents: 100000, platformShareCents: 100000, challengerVoteRevenueBonusCents: 2000, status: "pending_admin_review", payoutExecutionEnabled: false, sponsorReleaseEnabled: false, prizeReleaseEnabled: false, ...qaFields() }),
    doc("adVoteRewardLogs", "qa-ad-provider-off", { id: "qa-ad-provider-off", userId: "qa-dorocoin-empty", challengeId: "qa-prediction-eligible", adProvider: "not_configured", adRewardStatus: "not_available", voteGranted: false, providerVerificationRequired: true, fakeClientCompletionBlocked: true, ...qaFields() })
  ];
}

const CLEANUP_COLLECTIONS = [
  "qaSeedBatches",
  "users",
  "profiles",
  "challenges",
  "challengeParticipants",
  "privateChallengeInvites",
  "privateChallengeAccess",
  "sponsorProfiles",
  "doroCoinWallets",
  "predictionRecords",
  "rewardWheelPrizes",
  "rewardSpinHistory",
  "voterRewardEvents",
  "submissions",
  "revenueShareLedgers",
  "adVoteRewardLogs"
];

async function applySeed(db: Firestore, docs: SeedDoc[]) {
  let batch = db.batch();
  let opCount = 0;
  for (const item of docs) {
    batch.set(db.collection(item.collection).doc(item.id), item.data, { merge: true });
    opCount++;
    if (opCount % 450 === 0) {
      await batch.commit();
      batch = db.batch();
    }
  }
  if (opCount % 450 !== 0) await batch.commit();
}

async function cleanupSeed(db: Firestore) {
  let deleted = 0;
  for (const collection of CLEANUP_COLLECTIONS) {
    const snap = await db.collection(collection).where("qaSeedBatchId", "==", BATCH_ID).get();
    let batch = db.batch();
    let ops = 0;
    for (const found of snap.docs) {
      if (found.data().isQaSeed === true && found.data().qaSeedBatchId === BATCH_ID) {
        batch.delete(found.ref);
        deleted++;
        ops++;
      }
      if (ops > 0 && ops % 450 === 0) {
        await batch.commit();
        batch = db.batch();
      }
    }
    if (ops % 450 !== 0) await batch.commit();
  }
  return deleted;
}

async function main() {
  const docs = buildSeedDocs();
  const byCollection = docs.reduce<Record<string, number>>((acc, item) => {
    acc[item.collection] = (acc[item.collection] ?? 0) + 1;
    return acc;
  }, {});

  if (dryRun) {
    console.log(JSON.stringify({ mode: "dry-run", batchId: BATCH_ID, recordCount: docs.length, byCollection, applyCommand: "node --experimental-strip-types scripts/seed-phase-7-4i-qa.ts --apply", cleanupCommand: "node --experimental-strip-types scripts/seed-phase-7-4i-qa.ts --apply --cleanup" }, null, 2));
    return;
  }

  initializeAdmin();
  const db = getFirestore();
  if (cleanup) {
    const deleted = await cleanupSeed(db);
    console.log(JSON.stringify({ mode: "cleanup", batchId: BATCH_ID, deleted }, null, 2));
    return;
  }

  await applySeed(db, docs);
  console.log(JSON.stringify({ mode: "apply", batchId: BATCH_ID, recordCount: docs.length, byCollection }, null, 2));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
