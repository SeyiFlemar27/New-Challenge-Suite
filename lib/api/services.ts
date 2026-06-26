"use client";

import { apiRequest } from "./client";
import type { AccountType, SubscriptionPlan } from "@/lib/types";
import type { ProfileCustomization } from "@/lib/customization/options";

export interface DashboardResponse {
  user: {
    uid: string;
    email: string;
    displayName: string;
    initials: string;
    role: string | null;
    accountType?: AccountType;
    dashboardType?: string;
    planId: string;
    legacyPlanId?: string | null;
    planName?: string;
    planStatus?: string;
    premium: boolean;
    verified: boolean;
    totalPoints: number;
    doroBalance: number;
    customization?: ProfileCustomization;
  };
  stats: {
    activeChallenges: number;
    totalPoints: number;
    badgeCount: number;
    submissionCount: number;
  };
  challenges: unknown[];
  submissions: unknown[];
  wallet: unknown | null;
  badges: unknown[];
  leaderboard: unknown[];
  notifications: unknown[];
}

export function requestEmailVerificationCode() {
  return apiRequest<{ email: string; expiresAt: string; resendCooldownSeconds: number }>("/api/auth/email-otp/request", { method: "POST", body: JSON.stringify({}) });
}

export function verifyEmailCode(code: string) {
  return apiRequest<{ verified: boolean }>("/api/auth/email-otp/verify", { method: "POST", body: JSON.stringify({ code }) });
}
export function fetchBootstrapProfile() {
  return apiRequest<{
    profileExists: boolean;
    user: {
      uid: string;
      firstName?: string;
      lastName?: string;
      displayName: string;
      email: string;
      role?: string;
      accountType?: AccountType;
      dashboardType?: string;
      planId?: string;
      legacyPlanId?: string | null;
      planName?: string;
      planStatus?: string;
      doroBalance?: number;
      initials?: string;
      premium: boolean;
      isPremium?: boolean;
      isSponsor?: boolean;
      verified: boolean;
      emailVerified?: boolean;
      emailVerifiedAt?: string | null;
      isAdmin: boolean;
      sponsorOnboardingStatus?: string | null;
      sponsorOnboardingComplete?: boolean;
      hasSponsorProfile?: boolean;
      customization?: ProfileCustomization;
    };
  }>("/api/auth/profile/bootstrap");
}
export function fetchDashboard() {
  return apiRequest<DashboardResponse>("/api/dashboard");
}

export function fetchChallenges() {
  return apiRequest<{ challenges: unknown[] }>("/api/challenges");
}

export function fetchFeed(limit = 30) {
  return apiRequest<{ challenges: unknown[]; submissions: unknown[]; nextCursor: string | null }>(`/api/feed?limit=${limit}`);
}

export function fetchPrivateExclusiveChallenges(limit = 30) {
  return apiRequest<{ challenges: unknown[] }>(`/api/private-exclusive?limit=${limit}`);
}

export function checkPrivateInviteCode(inviteCode: string) {
  return apiRequest<{ challengeId: string }>("/api/private-exclusive", { method: "POST", body: JSON.stringify({ action: "check_code", inviteCode }) });
}

export function requestPrivateAccess(payload: { challengeId?: string; reason: string; note?: string }) {
  return apiRequest<{ requestId: string; status: string }>("/api/private-exclusive", { method: "POST", body: JSON.stringify({ action: "request_access", ...payload }) });
}

export function fetchChallengeDetails(challengeId: string) {
  return apiRequest<{
    challenge: unknown;
    submissions: unknown[];
    sponsorships: unknown[];
    voteCount: number;
    userState: {
      authenticated: boolean;
      joined: boolean;
      votedSubmissionIds: string[];
      voteCount: number;
    };
  }>(`/api/challenges/${challengeId}`);
}

export function fetchVotePackages() {
  return apiRequest<{ packages: unknown[] }>("/api/vote-packages");
}

export function fetchWallet() {
  return apiRequest<{
    user: unknown;
    wallet: { balance: number; lockedBalance: number; updatedAt?: string | null };
    transactions: unknown[];
  }>("/api/wallet");
}

export function fetchMyProfile() {
  return apiRequest<{
    profileExists: boolean;
    user: {
      uid: string;
      email: string;
      displayName: string;
      username?: string | null;
      initials: string;
      avatarUrl?: string | null;
      role?: string | null;
      accountType?: AccountType;
      dashboardType?: string;
      planId?: string | null;
      legacyPlanId?: string | null;
      planName?: string | null;
      selfDeclaredRegion?: "US" | "NG" | null;
      verified: boolean;
      premium: boolean;
      joinedAt?: string | null;
      doroBalance: number;
      customization?: ProfileCustomization;
      customizationUpdatedAt?: string | null;
      customizationUnlockedByPlan?: string | null;
    };
    stats: {
      totalPoints: number;
      submissions: number;
      totalLikes: number;
      followers: number;
      following: number;
    };
    badges: unknown[];
    submissions: unknown[];
  }>("/api/profile/me");
}

export function fetchSubscriptionPlans() {
  return apiRequest<{
    currentPlanId: string;
    subscriptionStatus: string;
    plans: SubscriptionPlan[];
  }>("/api/subscriptions");
}

export function fetchLiveEvents(limit = 30) {
  return apiRequest<{
    user: {
      uid: string;
      email: string;
      planId: string;
      subscriptionStatus: string;
      canHostLiveEvents: boolean;
    };
    events: unknown[];
  }>(`/api/live-events?limit=${limit}`);
}


type CheckoutResponse = {
  url?: string;
  checkoutUrl?: string;
  mode?: "mock";
  message?: string;
  developmentOnly?: boolean;
  paymentProcessed?: boolean;
  coinsCredited?: boolean;
  subscriptionActivated?: boolean;
  planActivated?: boolean;
};

export function fetchLiveEventDetails(eventId: string) {
  return apiRequest<{
    user: {
      uid: string;
      email: string;
      displayName: string;
      planId: string;
      subscriptionStatus: string;
    };
    event: unknown;
    registration: unknown | null;
  }>(`/api/live-events/${eventId}`);
}

export function createSubscriptionCheckout(planId: string) {
  return apiRequest<CheckoutResponse>("/api/stripe/checkout", { method: "POST", body: JSON.stringify({ planId }) });
}

export function updateMyProfile(payload: { displayName: string; selfDeclaredRegion: "US" | "NG" }) {
  return apiRequest<{ user: unknown }>("/api/profile/me", { method: "PATCH", body: JSON.stringify(payload) });
}

export function fetchProfileCustomization() {
  return apiRequest<{ customization: ProfileCustomization; access: unknown; options: unknown }>("/api/profile/customization");
}

export function updateProfileCustomization(customization: ProfileCustomization) {
  return apiRequest<{ customization: ProfileCustomization }>("/api/profile/customization", { method: "PATCH", body: JSON.stringify({ customization }) });
}

export function fetchDoroCoinPackages() {
  return apiRequest<{ packages: unknown[] }>("/api/dorocoin/packages");
}

export function fetchBoostPackages() {
  return apiRequest<{ packages: unknown[] }>("/api/boost-packages");
}

export function createChallenge(payload: unknown) {
  return apiRequest<{ challenge: unknown }>("/api/challenges", { method: "POST", body: JSON.stringify(payload) });
}

export function joinChallenge(challengeId: string, payload: { entryAgreementAccepted?: boolean } = {}) {
  return apiRequest(`/api/challenges/${challengeId}/join`, { method: "POST", body: JSON.stringify(payload) });
}

export function submitEntry(payload: unknown) {
  return apiRequest<{ submission: unknown }>("/api/submissions", { method: "POST", body: JSON.stringify(payload) });
}

export function fetchSubmissionDetails(submissionId: string) {
  return apiRequest<{
    submission: unknown;
    challenge: unknown | null;
    creator: unknown | null;
    rank: number | null;
    participant?: unknown | null;
    comments: unknown[];
  }>(`/api/submissions/${submissionId}`);
}

export function fetchWinners() {
  return apiRequest<{ winners: unknown[]; source?: string; message?: string | null }>("/api/winners");
}

export function fetchWinnerDetails(winnerId: string) {
  return apiRequest<{ winner: unknown; challenge: unknown | null; profile: unknown | null; leaderboard: unknown[]; resultStatus?: string; resultMessage?: string | null; payoutStatus?: string; payoutActive?: boolean }>(`/api/winners/${winnerId}`);
}

export function fetchLeaderboards(board = "global", options: { type?: "global" | "challenge"; challengeId?: string; limit?: number } = {}) {
  const params = new URLSearchParams({ board });
  if (options.type) params.set("type", options.type);
  if (options.challengeId) params.set("challengeId", options.challengeId);
  if (options.limit) params.set("limit", String(options.limit));
  return apiRequest<{ board: string; type?: string; entries: unknown[]; source: string; updatedAt: string | null; status?: string; visibilityMode?: string; visible?: boolean; message?: string | null }>(`/api/leaderboards?${params.toString()}`);
}

export function voteForSubmission(payload: { challengeId: string; submissionId: string; voteMode: "free" | "dorocoin"; quantity?: number }) {
  return apiRequest<{ vote: unknown; votes?: unknown[]; quantity?: number; coinCost?: number; walletTransactionId?: string | null }>("/api/votes", { method: "POST", body: JSON.stringify(payload) });
}

export function purchaseDoroCoins(packageId: string) {
  return apiRequest<CheckoutResponse>("/api/stripe/dorocoin-checkout", { method: "POST", body: JSON.stringify({ packageId }) });
}

export function purchaseCustomDoroCoins(coins: number) {
  return apiRequest<CheckoutResponse & { purchaseRequest?: unknown; paymentPending?: boolean }>("/api/stripe/dorocoin-checkout", { method: "POST", body: JSON.stringify({ customCoins: coins }) });
}

export function recordDoroCoinTransaction(payload: unknown) {
  return apiRequest<{ transaction: unknown }>("/api/dorocoin/transactions", { method: "POST", body: JSON.stringify(payload) });
}

export function boostChallenge(challengeId: string, packageId: string) {
  return apiRequest<{ boost: unknown }>(`/api/challenges/${challengeId}/boost`, { method: "POST", body: JSON.stringify({ packageId }) });
}

export function proposeSponsorship(challengeId: string, payload: unknown) {
  return apiRequest<{ sponsorship: unknown }>(`/api/challenges/${challengeId}/sponsorships`, { method: "POST", body: JSON.stringify(payload) });
}

export function registerForEvent(eventId: string, payload: unknown) {
  return apiRequest<{ registration: unknown }>(`/api/events/${eventId}/registrations`, { method: "POST", body: JSON.stringify(payload) });
}

export function fetchNotifications() {
  return apiRequest<{ notifications: unknown[] }>("/api/notifications");
}





