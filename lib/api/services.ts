"use client";

import { apiRequest } from "./client";
import type { SubscriptionPlan } from "@/lib/types";

export interface DashboardResponse {
  user: {
    uid: string;
    email: string;
    displayName: string;
    initials: string;
    role: string | null;
    planId: string;
    premium: boolean;
    verified: boolean;
    totalPoints: number;
    doroBalance: number;
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

export function requestPrivateAccess(challengeId?: string) {
  return apiRequest<{ requestId: string; status: string }>("/api/private-exclusive", { method: "POST", body: JSON.stringify({ action: "request_access", challengeId }) });
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
      planId?: string | null;
      selfDeclaredRegion?: "US" | "NG" | null;
      verified: boolean;
      premium: boolean;
      joinedAt?: string | null;
      doroBalance: number;
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
  return apiRequest<{ url?: string }>("/api/stripe/checkout", { method: "POST", body: JSON.stringify({ planId }) });
}

export function updateMyProfile(payload: { displayName: string; selfDeclaredRegion: "US" | "NG" }) {
  return apiRequest<{ user: unknown }>("/api/profile/me", { method: "PATCH", body: JSON.stringify(payload) });
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

export function joinChallenge(challengeId: string) {
  return apiRequest(`/api/challenges/${challengeId}/join`, { method: "POST", body: JSON.stringify({}) });
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
    comments: unknown[];
  }>(`/api/submissions/${submissionId}`);
}

export function fetchWinners() {
  return apiRequest<{ winners: unknown[] }>("/api/winners");
}

export function voteForSubmission(payload: { challengeId: string; submissionId: string; voteMode: "free" | "dorocoin" }) {
  return apiRequest<{ vote: unknown }>("/api/votes", { method: "POST", body: JSON.stringify(payload) });
}

export function purchaseDoroCoins(packageId: string) {
  return apiRequest<{ url?: string }>("/api/stripe/dorocoin-checkout", { method: "POST", body: JSON.stringify({ packageId }) });
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
