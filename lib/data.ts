import type { Challenge, SubscriptionPlan, Submission, UserProfile } from "./types";

export const currentUser: UserProfile = {
  id: "user_flemar",
  displayName: "Flemar",
  email: "seyiaakinsaya7@gmail.com",
  initials: "FL",
  planId: "competitor",
  selfDeclaredRegion: "US",
  doroBalance: 1250,
  totalPoints: 0,
  submissions: 0,
  totalLikes: 0,
  followers: 0,
  following: 0
};

export const plans: SubscriptionPlan[] = [
  {
    id: "observer",
    name: "Observer",
    audience: "creator",
    subtitle: "Free Tier",
    priceMonthly: 0,
    stripePriceEnv: "",
    features: ["View public challenges", "1 free vote per challenge/day", "Comment on public challenges", "Create 1 free group challenge/month", "Participate in group challenges"],
    canHostLiveEvents: false,
    liveEventCapacity: 0,
    canManageTournaments: false,
    canCreatePrizeChallenges: false,
    current: true
  },
  {
    id: "creator",
    name: "Creator",
    audience: "creator",
    subtitle: "For active users",
    priceMonthly: 24.99,
    stripePriceEnv: "STRIPE_PRICE_CREATOR",
    features: ["60 votes/month + 1 Multiplier", "Create up to 3 group challenges/mo", "Prize Pools up to $500", "1 Challenge Boost/month", "Comment & pin 1 comment"],
    canHostLiveEvents: false,
    liveEventCapacity: 0,
    canManageTournaments: false,
    canCreatePrizeChallenges: true
  },
  {
    id: "competitor",
    name: "Competitor",
    audience: "creator",
    subtitle: "Serious creators",
    priceMonthly: 59.99,
    stripePriceEnv: "STRIPE_PRICE_COMPETITOR",
    features: ["200 votes + 3 Multipliers", "Unlimited free group challenges", "Prize Pools up to $2,500 + Host 1v1", "Access to Ranked Challenges", "Host Small Live Events (10 pax)"],
    canHostLiveEvents: true,
    liveEventCapacity: 10,
    canManageTournaments: false,
    canCreatePrizeChallenges: true,
    recommended: true
  },
  {
    id: "executive_host",
    name: "Executive Host",
    audience: "creator",
    subtitle: "Event organizers",
    priceMonthly: 119,
    stripePriceEnv: "STRIPE_PRICE_EXECUTIVE_HOST",
    features: ["500 votes + 5 Multipliers", "Prize Pools up to $10,000", "Create Tournament Brackets & 1v1", "Unlimited Challenge Boosts", "Host Mid-Scale Live Events (15 pax)"],
    canHostLiveEvents: true,
    liveEventCapacity: 15,
    canManageTournaments: true,
    canCreatePrizeChallenges: true
  },
  {
    id: "chief_producer",
    name: "Chief Producer",
    audience: "creator",
    subtitle: "Culture architect",
    priceMonthly: 249,
    stripePriceEnv: "STRIPE_PRICE_CHIEF_PRODUCER",
    features: ["1,500 votes + Unlimited Multipliers", "Unlimited prize pools & events", "Sponsor-integrated challenges", "Tier-Restricted Special Events", "Host Large Live Events (25 pax)"],
    canHostLiveEvents: true,
    liveEventCapacity: 25,
    canManageTournaments: true,
    canCreatePrizeChallenges: true
  },
  {
    id: "brand_partner",
    name: "Brand Partner",
    audience: "sponsor",
    subtitle: "Sponsor growth",
    priceMonthly: 499,
    stripePriceEnv: "STRIPE_PRICE_BRAND_PARTNER",
    features: ["Sponsor up to 5 challenges", "Brand badge on listings", "Custom CTA button", "Engagement dashboard", "Access to sponsor-only placements"],
    canHostLiveEvents: false,
    liveEventCapacity: 0,
    canManageTournaments: false,
    canCreatePrizeChallenges: false
  },
  {
    id: "enterprise_sponsor",
    name: "Enterprise Sponsor",
    audience: "sponsor",
    subtitle: "Enterprise campaigns",
    priceMonthly: 1250,
    stripePriceEnv: "STRIPE_PRICE_ENTERPRISE_SPONSOR",
    features: ["Unlimited sponsored challenges", "Logo on challenge feed", "Weekly Featured Sponsor banner", "Direct ROI analytics", "Co-branded live event integration"],
    canHostLiveEvents: false,
    liveEventCapacity: 0,
    canManageTournaments: false,
    canCreatePrizeChallenges: false
  }
];

export const challenges: Challenge[] = [
  {
    id: "neon-city-photo",
    title: "Neon City Photo Sprint",
    description: "Capture a bold night scene with strong color, reflections, and a clear urban story.",
    category: "Photography",
    imageUrl: "https://images.unsplash.com/photo-1519608487953-e999c86e7455?auto=format&fit=crop&w=1400&q=80",
    trailerUrl: "https://interactive-examples.mdn.mozilla.net/media/cc0-videos/flower.mp4",
    type: "Normal Challenge",
    competitionFormat: "1 vs 1 Battle",
    bestOf: "Best of 3",
    acceptedSubmissionTypes: ["image", "video"],
    prizeType: "Cash Jackpot",
    entryFee: 0,
    prizePool: 6900,
    startsAt: "2026-01-24",
    endsAt: "2026-02-01",
    registrationDeadline: "2026-01-22",
    participants: 178,
    status: "active",
    rules: [
      { id: "community", label: "Community guidelines apply", enabled: true, editableText: "Standard platform policies apply." },
      { id: "vote-limit", label: "Free vote limit", enabled: true, editableText: "Free users get 1 vote per challenge/day." },
      { id: "purchase", label: "Additional votes", enabled: true, editableText: "Users may purchase additional votes after accepting the paid voting agreement." }
    ],
    ageRestriction: { enabled: false },
    timeLimitedUploads: { enabled: false },
    sponsorshipAllocation: [
      { bucket: "Platform ROI", percent: 12, enabled: true },
      { bucket: "Creator Share", percent: 3, enabled: true }
    ]
  },
  {
    id: "kitchen-remix",
    title: "Kitchen Remix Showdown",
    description: "Create a short food presentation with personality, plating, and a surprising ingredient twist.",
    category: "Fitness",
    imageUrl: "https://images.unsplash.com/photo-1556911220-bff31c812dba?auto=format&fit=crop&w=1400&q=80",
    type: "Normal Challenge",
    competitionFormat: "Entry Competition",
    twoStepFormat: "Entry Competition",
    bestOf: "1 Rounder",
    acceptedSubmissionTypes: ["video"],
    prizeType: "Bragging Rights (Leaderboard Ranking)",
    entryFee: null,
    prizePool: 0,
    startsAt: "2026-01-24",
    endsAt: "2026-01-29",
    registrationDeadline: "2026-01-22",
    participants: 634,
    status: "completed",
    rules: [{ id: "dance", label: "Original performance", enabled: true, editableText: "Submissions must be original." }],
    ageRestriction: { enabled: true, minimumAge: 13 },
    timeLimitedUploads: { enabled: true, startsAt: "2026-01-24", endsAt: "2026-01-27" },
    sponsorshipAllocation: [
      { bucket: "Platform ROI", percent: 12, enabled: true },
      { bucket: "Creator Share", percent: 3, enabled: true }
    ]
  },
  {
    id: "vault-studio-invite",
    title: "Vault Studio Invite Challenge",
    description: "An invite-only creator challenge for polished short-form entries with a premium audience vote.",
    category: "Creative",
    imageUrl: "https://images.unsplash.com/photo-1516280440614-37939bbacd81?auto=format&fit=crop&w=1400&q=80",
    trailerUrl: "https://interactive-examples.mdn.mozilla.net/media/cc0-videos/flower.mp4",
    type: "Private / Exclusive",
    competitionFormat: "Entry Competition",
    twoStepFormat: "Entry Competition",
    bestOf: "1 Rounder",
    acceptedSubmissionTypes: ["image", "video"],
    prizeType: "DoroCoin",
    entryFee: 15,
    prizePool: 1800,
    startsAt: "2026-02-05",
    endsAt: "2026-02-12",
    registrationDeadline: "2026-02-03",
    participants: 42,
    status: "upcoming",
    rules: [
      { id: "invite", label: "Invite required", enabled: true, editableText: "Participants must have a valid invite code before submitting." },
      { id: "media", label: "Media required", enabled: true, editableText: "A media submission is required before final entry." }
    ],
    ageRestriction: { enabled: true, minimumAge: 18 },
    timeLimitedUploads: { enabled: true, startsAt: "2026-02-05", endsAt: "2026-02-10" },
    sponsorshipAllocation: [
      { bucket: "Platform ROI", percent: 10, enabled: true },
      { bucket: "Creator Share", percent: 5, enabled: true }
    ]
  }
];

const images = [
  "https://images.unsplash.com/photo-1543352634-a1c51d9f1fa7?auto=format&fit=crop&w=900&q=80",
  "https://images.unsplash.com/photo-1500530855697-b586d89ba3ee?auto=format&fit=crop&w=900&q=80",
  "https://images.unsplash.com/photo-1500382017468-9049fed747ef?auto=format&fit=crop&w=900&q=80",
  "https://images.unsplash.com/photo-1477414348463-c0eb7f1359b6?auto=format&fit=crop&w=900&q=80",
  "https://images.unsplash.com/photo-1500534314209-a25ddb2bd429?auto=format&fit=crop&w=900&q=80",
  "https://images.unsplash.com/photo-1517248135467-4c7edcad34c4?auto=format&fit=crop&w=900&q=80",
  "https://images.unsplash.com/photo-1441974231531-c6227db76b6e?auto=format&fit=crop&w=900&q=80",
  "https://images.unsplash.com/photo-1500534314209-a25ddb2bd429?auto=format&fit=crop&w=900&q=80",
  "https://images.unsplash.com/photo-1516280440614-37939bbacd81?auto=format&fit=crop&w=900&q=80"
];

export const submissions: Submission[] = images.map((mediaUrl, index) => ({
  id: `submission-${index + 1}`,
  challengeId: index === 0 ? "kitchen-remix" : "neon-city-photo",
  title: index === 0 ? "Midnight Citrus Plate" : ["Rainline Portrait", "Field Notes", "Golden Lift", "Stone Garden", "Breakfast Color Study", "Quiet Harbor", "Concrete Glow", "Doro Studio Cut"][index - 1] ?? "Creative Entry",
  description: index === 0 ? "A bright food entry with motion, texture, and a citrus finish." : "A community submission built for visual impact.",
  userId: index % 2 === 0 ? "john" : "emily",
  userName: index % 2 === 0 ? "johndoe" : "emilysmith",
  userInitials: index % 2 === 0 ? "JD" : "ES",
  mediaUrl,
  mediaType: "image",
  challengeTitle: index % 3 === 0 ? "Kitchen Remix Showdown" : index % 3 === 1 ? "Neon City Photo Sprint" : "Micro Story Challenge",
  challengeCategory: index % 2 === 0 ? "Fitness" : "Creative",
  likes: [1248, 989, 892, 737, 680, 569, 523, 424, 0][index] ?? 0,
  isWinner: index < 4,
  createdAt: index === 8 ? "2026-03-29" : "2026-01-24"
}));
