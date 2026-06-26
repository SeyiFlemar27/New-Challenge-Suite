export type RegionCode = "US" | "NG";
export type SubmissionType = "image" | "video";
export type PrizeType = "Cash Jackpot" | "Product Prize" | "Bragging Rights (Leaderboard Ranking)" | "DoroCoin";
export type AgreementType =
  | "master_account"
  | "challenge_entry"
  | "paid_voting"
  | "dorocoin"
  | "challenge_creator"
  | "sponsor"
  | "live_event"
  | "winner_claim"
  | "anti_fraud";

export type AccountType = "user" | "sponsor" | "admin";
export type UserProductPlanId = "free" | "creator" | "pro" | "host" | "enterprise";
export type SponsorProductPlanId = "sponsor_starter" | "brand_partner" | "enterprise_partner";
export type ProductPlanId = UserProductPlanId | SponsorProductPlanId;
export type LegacyPlanId = "observer" | "premium" | "creator_pro" | "verified_host" | "competitor" | "executive_host" | "chief_producer" | "enterprise_sponsor";
export type UserPlanId = ProductPlanId | LegacyPlanId;
export type AppRole = "user" | "creator" | "sponsor";

export interface UserProfile {
  id: string;
  displayName: string;
  email: string;
  initials: string;
  role?: AppRole;
  accountType?: AccountType;
  planId: UserPlanId;
  selfDeclaredRegion?: RegionCode;
  doroBalance: number;
  totalPoints: number;
  submissions: number;
  totalLikes: number;
  followers: number;
  following: number;
}

export interface SubscriptionPlan {
  id: UserPlanId;
  name: string;
  audience: "creator" | "sponsor";
  subtitle: string;
  priceMonthly: number;
  stripePriceEnv: string;
  legacyStripePriceEnvs?: string[];
  features: string[];
  canHostLiveEvents: boolean;
  liveEventCapacity: number;
  canManageTournaments: boolean;
  canCreatePrizeChallenges: boolean;
  recommended?: boolean;
  current?: boolean;
}

export interface Challenge {
  id: string;
  title: string;
  description: string;
  category: string;
  customCategory?: string;
  imageUrl: string;
  trailerUrl?: string;
  type: "Normal Challenge" | "Private / Exclusive";
  competitionFormat: string;
  twoStepFormat?: "Entry Competition" | "Semifinal + Final" | "Qualifier + Final";
  bestOf: "1 Rounder" | "Best of 3" | "Best of 5";
  acceptedSubmissionTypes: SubmissionType[];
  prizeType: PrizeType;
  entryFee: number | null;
  prizePool: number;
  startsAt: string;
  endsAt: string;
  registrationDeadline: string;
  participants: number;
  status: "upcoming" | "active" | "completed";
  rules: EditableRule[];
  ageRestriction?: { enabled: boolean; minimumAge?: number };
  timeLimitedUploads?: { enabled: boolean; startsAt?: string; endsAt?: string };
  sponsorshipAllocation: SponsorshipAllocation[];
}

export interface EditableRule {
  id: string;
  label: string;
  enabled: boolean;
  editableText: string;
}

export interface SponsorshipAllocation {
  bucket: string;
  percent: number;
  enabled: boolean;
}

export interface Submission {
  id: string;
  challengeId: string;
  title: string;
  description: string;
  userId: string;
  userName: string;
  userInitials: string;
  mediaUrl: string;
  mediaType: SubmissionType;
  challengeTitle: string;
  challengeCategory: string;
  likes: number;
  isWinner?: boolean;
  createdAt: string;
}

export interface ConsentRecord {
  id: string;
  userId: string;
  agreementType: AgreementType;
  agreementVersion: string;
  timestamp: string;
  ipAddress: string;
  deviceInformation: string;
  region: string;
  targetId?: string;
}
