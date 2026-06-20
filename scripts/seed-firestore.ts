import nextEnv from "@next/env";
import { cert, getApps, initializeApp } from "firebase-admin/app";
import { getFirestore, type Firestore } from "firebase-admin/firestore";
const { loadEnvConfig } = nextEnv;
loadEnvConfig(process.cwd());

const dryRun = process.argv.includes("--dry-run");
const demoUserId = process.env.SEED_USER_ID || process.env.DEMO_USER_ID || "demo-user-challenge-suite";
const now = new Date();
const iso = (offsetDays = 0) => new Date(now.getTime() + offsetDays * 24 * 60 * 60 * 1000).toISOString();

const requiredAdminEnv = ["NEXT_PUBLIC_FIREBASE_PROJECT_ID", "FIREBASE_CLIENT_EMAIL", "FIREBASE_PRIVATE_KEY"] as const;

function getRequiredEnv(name: (typeof requiredAdminEnv)[number]) {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required environment variable: ${name}`);
  return value;
}

function validateAdminEnv() {
  const missing = requiredAdminEnv.filter((name) => !process.env[name]);
  if (missing.length > 0) {
    throw new Error(
      `Missing Firebase Admin environment variable(s): ${missing.join(", ")}. ` +
        "Add them to .env.local before running the real seed. Dry runs do not require Firebase Admin credentials."
    );
  }
}

function initializeAdmin() {
  if (getApps().length) return;
  validateAdminEnv();
  const projectId = getRequiredEnv("NEXT_PUBLIC_FIREBASE_PROJECT_ID");
  const clientEmail = getRequiredEnv("FIREBASE_CLIENT_EMAIL");
  const privateKey = getRequiredEnv("FIREBASE_PRIVATE_KEY").replace(/\\n/g, "\n");
  const storageBucket = process.env.FIREBASE_STORAGE_BUCKET || process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET;
  initializeApp({ storageBucket, credential: cert({ projectId, clientEmail, privateKey }) });
}

type SeedDoc = { id: string } & Record<string, unknown>;

const demoProfiles: SeedDoc[] = [
  { id: "demo-creator-lens-league", displayName: "Lens League", initials: "LL", role: "creator", planId: "chief_producer", premium: true, totalPoints: 18420, email: "lens@example.com" },
  { id: "demo-creator-move-district", displayName: "Move District", initials: "MD", role: "creator", planId: "pro_creator", premium: true, totalPoints: 16900, email: "move@example.com" },
  { id: "demo-user-nia-stone", displayName: "Nia Stone", initials: "NS", role: "user", planId: "chief_producer", premium: true, totalPoints: 18420, email: "nia@example.com" },
  { id: "demo-user-theo-grant", displayName: "Theo Grant", initials: "TG", role: "user", planId: "pro_creator", premium: true, totalPoints: 16900, email: "theo@example.com" },
  { id: demoUserId, displayName: "Demo Member", initials: "DM", role: "creator", planId: "chief_producer", premium: true, totalPoints: 12840, email: "demo-member@example.com" }
];

const challenges: SeedDoc[] = [
  {
    id: "demo-neon-city-photo",
    creatorId: "demo-creator-lens-league",
    creatorName: "Lens League",
    title: "Neon City Photo Battle",
    description: "Capture a cinematic night city moment using light, reflection, motion, and mood.",
    category: "Photography",
    imageUrl: "https://images.unsplash.com/photo-1519608487953-e999c86e7455?auto=format&fit=crop&w=1400&q=80",
    promoImageUrl: "https://images.unsplash.com/photo-1519608487953-e999c86e7455?auto=format&fit=crop&w=1400&q=80",
    trailerUrl: "",
    trailerVideoUrl: "",
    type: "public",
    visibility: "public",
    status: "active",
    competitionFormat: "Entry Competition",
    bestOf: "1 Rounder",
    acceptedSubmissionTypes: ["image"],
    prizeType: "Cash Prize",
    entryFee: 10,
    prizePool: 2500,
    participantCount: 248,
    participants: 248,
    submissionCount: 3,
    voteCount: 18420,
    weightedVoteCount: 18420,
    requiresSubmissionApproval: true,
    startsAt: iso(-7),
    registrationDeadline: iso(2),
    endsAt: iso(7),
    votingEndsAt: iso(8),
    rules: ["Original photo only", "No AI-generated images", "One entry per participant", "Voting closes Sunday at 9 PM"],
    createdAt: iso(-10),
    updatedAt: iso(-1)
  },
  {
    id: "demo-street-dance-finals",
    creatorId: "demo-creator-move-district",
    creatorName: "Move District",
    title: "Street Dance Finals",
    description: "Upload your strongest 45-second routine and compete for crowd-ranked finals.",
    category: "Dance",
    imageUrl: "https://images.unsplash.com/photo-1508700115892-45ecd05ae2ad?auto=format&fit=crop&w=1400&q=80",
    promoImageUrl: "https://images.unsplash.com/photo-1508700115892-45ecd05ae2ad?auto=format&fit=crop&w=1400&q=80",
    type: "public",
    visibility: "public",
    status: "published",
    competitionFormat: "Entry Competition",
    bestOf: "1 Rounder",
    acceptedSubmissionTypes: ["video"],
    prizeType: "Cash Prize",
    entryFee: 25,
    prizePool: 5000,
    participantCount: 96,
    participants: 96,
    submissionCount: 1,
    voteCount: 7200,
    weightedVoteCount: 7200,
    requiresSubmissionApproval: true,
    startsAt: iso(-2),
    registrationDeadline: iso(5),
    endsAt: iso(12),
    votingEndsAt: iso(13),
    rules: ["45 seconds maximum", "Solo or duo allowed", "No copyrighted overlays", "Top 8 advance"],
    createdAt: iso(-6),
    updatedAt: iso(-1)
  },
  {
    id: "demo-founder-pitch-sprint",
    creatorId: "demo-creator-lens-league",
    creatorName: "Capital Arena",
    title: "Founder Pitch Sprint",
    description: "A private pitch challenge for verified founders and sponsors.",
    category: "Business",
    imageUrl: "https://images.unsplash.com/photo-1556761175-b413da4baf72?auto=format&fit=crop&w=1400&q=80",
    promoImageUrl: "https://images.unsplash.com/photo-1556761175-b413da4baf72?auto=format&fit=crop&w=1400&q=80",
    type: "private",
    visibility: "private",
    status: "published",
    competitionFormat: "Entry Competition",
    acceptedSubmissionTypes: ["video"],
    prizeType: "Bragging Rights (Leaderboard Ranking)",
    entryFee: 0,
    prizePool: 0,
    participantCount: 32,
    participants: 32,
    submissionCount: 0,
    voteCount: 0,
    weightedVoteCount: 0,
    requiresSubmissionApproval: true,
    startsAt: iso(1),
    registrationDeadline: iso(10),
    endsAt: iso(21),
    votingEndsAt: iso(22),
    rules: ["Invite required", "Deck optional", "Video under 2 minutes", "Creator approval before public display"],
    createdAt: iso(-3),
    updatedAt: iso(-1)
  }
];

const submissions: SeedDoc[] = [
  { id: "demo-sub-rainline-reflections", challengeId: "demo-neon-city-photo", challengeTitle: "Neon City Photo Battle", challengeCategory: "Photography", userId: "demo-user-nia-stone", userName: "Nia Stone", userInitials: "NS", userPlanId: "chief_producer", title: "Rainline Reflections", description: "A cinematic city moment after midnight rain.", mediaUrl: "https://images.unsplash.com/photo-1500530855697-b586d89ba3ee?auto=format&fit=crop&w=1400&q=80", mediaType: "image", status: "winner", visibility: "public", voteCount: 4382, weightedVoteCount: 4382, likes: 4382, isWinner: true, submittedAt: iso(-4), createdAt: iso(-4), updatedAt: iso(-1) },
  { id: "demo-sub-midnight-crosswalk", challengeId: "demo-neon-city-photo", challengeTitle: "Neon City Photo Battle", challengeCategory: "Photography", userId: "demo-user-theo-grant", userName: "Theo Grant", userInitials: "TG", userPlanId: "pro_creator", title: "Midnight Crosswalk", description: "Crosswalk light, movement, and deep city contrast.", mediaUrl: "https://images.unsplash.com/photo-1493246507139-91e8fad9978e?auto=format&fit=crop&w=1400&q=80", mediaType: "image", status: "approved", visibility: "public", voteCount: 3910, weightedVoteCount: 3910, likes: 3910, isWinner: false, submittedAt: iso(-3), createdAt: iso(-3), updatedAt: iso(-1) },
  { id: "demo-sub-gold-hour-spin", challengeId: "demo-street-dance-finals", challengeTitle: "Street Dance Finals", challengeCategory: "Dance", userId: "demo-user-nia-stone", userName: "Kemi Vale", userInitials: "KV", userPlanId: "chief_producer", title: "Gold Hour Spin", description: "A compact routine with sharp musicality and footwork.", mediaUrl: "https://images.unsplash.com/photo-1547153760-18fc86324498?auto=format&fit=crop&w=1400&q=80", mediaType: "image", status: "approved", visibility: "public", voteCount: 2877, weightedVoteCount: 2877, likes: 2877, isWinner: false, submittedAt: iso(-2), createdAt: iso(-2), updatedAt: iso(-1) }
];

const doroPackages: SeedDoc[] = [
  { id: "doro_50", name: "Starter", coins: 50, price: 1.99, bestFor: "Quick votes", description: "A small pack for trying DoroCoin voting.", status: "active", sortOrder: 1, stripePriceId: process.env.STRIPE_PRICE_DOROCOIN_50 ?? null, createdAt: iso(-1), updatedAt: iso(-1) },
  { id: "doro_100", name: "Popular", coins: 100, price: 7.99, bestFor: "Vote packs", description: "A balanced pack for challenge voters.", status: "active", sortOrder: 2, stripePriceId: process.env.STRIPE_PRICE_DOROCOIN_100 ?? null, createdAt: iso(-1), updatedAt: iso(-1) },
  { id: "doro_500", name: "Power", coins: 500, price: 19.99, bestFor: "Boosts and voting", description: "Best for boosts, vote runs, and premium entries.", status: "active", sortOrder: 3, stripePriceId: process.env.STRIPE_PRICE_DOROCOIN_500 ?? null, createdAt: iso(-1), updatedAt: iso(-1) }
];

const categories: SeedDoc[] = ["Photography", "Dance", "Business", "Music", "Fitness", "Gaming"].map((name, index) => ({ id: `demo-${name.toLowerCase()}`, name, status: "active", sortOrder: index + 1, createdAt: iso(-1), updatedAt: iso(-1) }));
const liveEvents: SeedDoc[] = [
  {
    id: "demo-live-atlanta-creator-night",
    title: "Atlanta Creator Night",
    description: "A verified in-person creator showcase with live voting, finalist interviews, and sponsor activations.",
    hostName: "Challenge Suite Live",
    host: "Challenge Suite Live",
    hostId: "demo-creator-lens-league",
    imageUrl: "https://images.unsplash.com/photo-1505373877841-8d25f7d46678?auto=format&fit=crop&w=1400&q=80",
    mediaUrl: "https://images.unsplash.com/photo-1505373877841-8d25f7d46678?auto=format&fit=crop&w=1400&q=80",
    location: "Atlanta, GA",
    venueName: "Westside Creative Hall",
    startsAt: iso(14),
    date: iso(14),
    time: "7:00 PM",
    startTime: "7:00 PM",
    eventType: "Live showcase",
    category: "Creator Showcase",
    visibility: "public",
    status: "scheduled",
    capacity: 180,
    maxAttendees: 180,
    attending: 74,
    attendeeCount: 74,
    registrationCount: 74,
    registrationOpen: true,
    registrationStatus: "open",
    registrationDeadline: iso(12),
    price: 0,
    ticketPrice: 0,
    requiredPlanId: null,
    createdAt: iso(-2),
    updatedAt: iso(-1)
  },
  {
    id: "demo-live-lagos-dance-arena",
    title: "Lagos Dance Arena",
    description: "A premium live dance bracket with verified hosts, crowd voting, and final winner announcements.",
    hostName: "Move District",
    host: "Move District",
    hostId: "demo-creator-move-district",
    imageUrl: "https://images.unsplash.com/photo-1540039155733-5bb30b53aa14?auto=format&fit=crop&w=1400&q=80",
    mediaUrl: "https://images.unsplash.com/photo-1540039155733-5bb30b53aa14?auto=format&fit=crop&w=1400&q=80",
    location: "Lagos, Nigeria",
    venueName: "Victoria Island Performance Studio",
    startsAt: iso(28),
    date: iso(28),
    time: "6:30 PM",
    startTime: "6:30 PM",
    eventType: "Tournament",
    category: "Dance",
    visibility: "public",
    status: "scheduled",
    capacity: 250,
    maxAttendees: 250,
    attending: 118,
    attendeeCount: 118,
    registrationCount: 118,
    registrationOpen: true,
    registrationStatus: "open",
    registrationDeadline: iso(24),
    price: 15,
    ticketPrice: 15,
    requiredPlanId: "chief_producer",
    createdAt: iso(-2),
    updatedAt: iso(-1)
  },
  {
    id: "demo-live-houston-founder-arena",
    title: "Houston Founder Arena",
    description: "A live pitch-room challenge for founders, sponsors, and verified community voters.",
    hostName: "Capital Arena",
    host: "Capital Arena",
    hostId: "demo-creator-lens-league",
    imageUrl: "https://images.unsplash.com/photo-1556761175-4b46a572b786?auto=format&fit=crop&w=1400&q=80",
    mediaUrl: "https://images.unsplash.com/photo-1556761175-4b46a572b786?auto=format&fit=crop&w=1400&q=80",
    location: "Houston, TX",
    venueName: "Ion Innovation Hall",
    startsAt: iso(42),
    date: iso(42),
    time: "5:00 PM",
    startTime: "5:00 PM",
    eventType: "Brand activation",
    category: "Business",
    visibility: "public",
    status: "scheduled",
    capacity: 120,
    maxAttendees: 120,
    attending: 39,
    attendeeCount: 39,
    registrationCount: 39,
    registrationOpen: true,
    registrationStatus: "open",
    registrationDeadline: iso(38),
    price: 25,
    ticketPrice: 25,
    requiredPlanId: null,
    createdAt: iso(-2),
    updatedAt: iso(-1)
  }
];
const leaderboardEntries = [
  { userId: "demo-user-nia-stone", displayName: "Nia Stone", name: "Nia Stone", points: 18420, score: 18420, badge: "Photo Champion", rank: 1 },
  { userId: "demo-user-theo-grant", displayName: "Theo Grant", name: "Theo Grant", points: 16900, score: 16900, badge: "Top Voter", rank: 2 },
  { userId: "demo-user-kemi-vale", displayName: "Kemi Vale", name: "Kemi Vale", points: 14775, score: 14775, badge: "Finalist", rank: 3 },
  { userId: demoUserId, displayName: "Demo Member", name: "Demo Member", points: 12840, score: 12840, badge: "Creator", rank: 4 }
];
const badges: SeedDoc[] = [
  { id: `demo-${demoUserId}-verified`, userId: demoUserId, title: "Verified Competitor", name: "Verified Competitor", description: "Completed demo verification.", icon: "shield", status: "earned", earnedAt: iso(-5), createdAt: iso(-5), updatedAt: iso(-1) },
  { id: `demo-${demoUserId}-top-voter`, userId: demoUserId, title: "Top Voter", name: "Top Voter", description: "Supported standout submissions with DoroCoins.", icon: "vote", status: "earned", earnedAt: iso(-2), createdAt: iso(-2), updatedAt: iso(-1) }
];
const notifications: SeedDoc[] = [
  { id: `demo-${demoUserId}-welcome`, userId: demoUserId, type: "welcome", title: "Welcome to Challenge Suite", body: "Demo challenges, DoroCoin packs, and winners are ready to explore.", read: false, targetId: "demo-neon-city-photo", createdAt: iso(-1), updatedAt: iso(-1) },
  { id: `demo-${demoUserId}-vote`, userId: demoUserId, type: "voting_open", title: "Voting is open", body: "Neon City Photo Battle is collecting verified votes now.", read: false, targetId: "demo-neon-city-photo", createdAt: iso(-0.5), updatedAt: iso(-0.5) }
];
const wallet: SeedDoc = { id: demoUserId, userId: demoUserId, balance: 500, lockedBalance: 0, updatedAt: iso(-1) };
const walletTransactions: SeedDoc[] = [
  { id: `demo-${demoUserId}-grant`, userId: demoUserId, amount: 500, balanceAfter: 500, type: "admin_grant", description: "Demo launch DoroCoin grant", sourceId: "demo-seed", createdBy: "seed-script", createdAt: iso(-1) },
  { id: `demo-${demoUserId}-vote-spend`, userId: demoUserId, amount: -100, balanceAfter: 400, type: "vote_spend", description: "Demo vote spend for Rainline Reflections", sourceId: "demo-sub-rainline-reflections", createdBy: demoUserId, createdAt: iso(-0.25) }
];

async function writeDoc(db: Firestore | null, collection: string, id: string, data: Record<string, unknown>) {
  if (dryRun) {
    console.log(`[dry-run] set ${collection}/${id}`);
    return;
  }
  if (!db) throw new Error("Firestore is not initialized.");
  await db.collection(collection).doc(id).set(data, { merge: true });
  console.log(`set ${collection}/${id}`);
}

async function main() {
  if (!dryRun) initializeAdmin();
  const db = dryRun ? null : getFirestore();
  console.log(`${dryRun ? "Dry run" : "Seeding"} Challenge Suite Firestore demo data`);
  console.log(`User-specific demo records target userId: ${demoUserId}`);

  for (const profile of demoProfiles) {
    await writeDoc(db, "profiles", profile.id, { ...profile, verified: true, emailVerified: true, updatedAt: iso(-1), createdAt: iso(-30) });
    await writeDoc(db, "users", profile.id, { ...profile, emailVerified: true, verificationStatus: "verified", updatedAt: iso(-1), createdAt: iso(-30) });
  }
  for (const category of categories) await writeDoc(db, "challengeCategories", category.id, category);
  for (const challenge of challenges) await writeDoc(db, "challenges", challenge.id, challenge);
  for (const submission of submissions) await writeDoc(db, "submissions", submission.id, submission);
  for (const event of liveEvents) await writeDoc(db, "liveEvents", event.id, event);
  await writeDoc(db, "leaderboards", "global", { id: "global", entries: leaderboardEntries, updatedAt: iso(-1), createdAt: iso(-10) });
  await writeDoc(db, "winners", "demo-winner-rainline-reflections", { id: "demo-winner-rainline-reflections", challengeId: "demo-neon-city-photo", submissionId: "demo-sub-rainline-reflections", userId: "demo-user-nia-stone", rank: 1, status: "confirmed", createdAt: iso(-1), updatedAt: iso(-1) });
  for (const badge of badges) await writeDoc(db, "badges", badge.id, badge);
  for (const notification of notifications) await writeDoc(db, "notifications", notification.id, notification);
  for (const pack of doroPackages) await writeDoc(db, "doroCoinPackages", pack.id, pack);
  await writeDoc(db, "doroCoinWallets", wallet.id, wallet);
  for (const transaction of walletTransactions) await writeDoc(db, "doroCoinTransactions", transaction.id, transaction);
  console.log("Seed complete.");
}

main().catch((error) => {
  console.error("Seed failed:", error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
