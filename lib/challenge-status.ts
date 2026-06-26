import type { Challenge } from "./types";

export type CanonicalChallengeStatus =
  | "draft"
  | "pending_review"
  | "scheduled"
  | "active"
  | "submission_open"
  | "voting_open"
  | "voting_closed"
  | "under_review"
  | "winners_announced"
  | "completed"
  | "cancelled"
  | "paused";

export type LegacyChallengeStatus = "published" | "registration_open" | "voting";

export type ChallengeDisplayStatus = "Open" | "Active" | "Closing Soon" | "Closed" | "Voting Open" | "Voting Closed" | "Under Review" | "Paused";

const activeDashboardStatuses = new Set<CanonicalChallengeStatus | LegacyChallengeStatus>([
  "pending_review",
  "scheduled",
  "active",
  "submission_open",
  "voting_open",
  "voting_closed",
  "under_review",
  "published",
  "registration_open",
  "voting"
]);

const sponsorEligibleStatuses = new Set<CanonicalChallengeStatus | LegacyChallengeStatus>([
  "pending_review",
  "scheduled",
  "active",
  "submission_open",
  "voting_open",
  "published",
  "registration_open",
  "voting"
]);

const boostEligibleStatuses = new Set<CanonicalChallengeStatus | LegacyChallengeStatus>([
  "scheduled",
  "active",
  "submission_open",
  "voting_open",
  "published",
  "registration_open",
  "voting"
]);

const publicChallengeStatuses = new Set<CanonicalChallengeStatus | LegacyChallengeStatus>([
  "pending_review",
  "scheduled",
  "active",
  "submission_open",
  "voting_open",
  "voting_closed",
  "under_review",
  "winners_announced",
  "completed",
  "published",
  "registration_open",
  "voting"
]);

const votableSubmissionStatuses = new Set(["active", "approved", "winner"]);
const unavailableSubmissionStatuses = new Set(["draft", "submitted", "pending_review", "pending_approval", "rejected", "flagged", "removed", "private", "withdrawn", "disqualified", "eliminated"]);

export function normalizeChallengeLifecycleStatus(status: unknown): CanonicalChallengeStatus {
  const value = String(status ?? "draft").toLowerCase();
  if (value === "published") return "active";
  if (value === "registration_open") return "submission_open";
  if (value === "voting") return "voting_open";
  if (isCanonicalChallengeStatus(value)) return value;
  return "draft";
}

export function isLegacyChallengeStatus(status: unknown): status is LegacyChallengeStatus {
  return status === "published" || status === "registration_open" || status === "voting";
}

export function isCanonicalChallengeStatus(status: unknown): status is CanonicalChallengeStatus {
  return [
    "draft",
    "pending_review",
    "scheduled",
    "active",
    "submission_open",
    "voting_open",
    "voting_closed",
    "under_review",
    "winners_announced",
    "completed",
    "cancelled",
    "paused"
  ].includes(String(status));
}

export function isChallengeActiveForDashboard(status: unknown) {
  return activeDashboardStatuses.has(String(status ?? "").toLowerCase() as CanonicalChallengeStatus | LegacyChallengeStatus);
}

export function isChallengeEligibleForBoost(status: unknown) {
  return boostEligibleStatuses.has(String(status ?? "").toLowerCase() as CanonicalChallengeStatus | LegacyChallengeStatus);
}

export function isChallengeEligibleForSponsorship(status: unknown) {
  return sponsorEligibleStatuses.has(String(status ?? "").toLowerCase() as CanonicalChallengeStatus | LegacyChallengeStatus);
}

export function isPublicChallengeStatus(status: unknown) {
  return publicChallengeStatuses.has(String(status ?? "").toLowerCase() as CanonicalChallengeStatus | LegacyChallengeStatus);
}

export function normalizeSubmissionLifecycleStatus(status: unknown) {
  const value = String(status ?? "draft").toLowerCase();
  if (value === "pending_approval") return "pending_review";
  return value;
}

export function isSubmissionUnavailableForVoting(status: unknown) {
  return unavailableSubmissionStatuses.has(String(status ?? "").toLowerCase());
}

export function isSubmissionVotableStatus(status: unknown) {
  return votableSubmissionStatuses.has(normalizeSubmissionLifecycleStatus(status));
}

export function getChallengeDisplayStatus(challenge: Challenge | Record<string, unknown>, now = new Date()): ChallengeDisplayStatus {
  const lifecycleStatus = normalizeChallengeLifecycleStatus((challenge as Record<string, unknown>).status);
  if (lifecycleStatus === "paused") return "Paused";
  if (lifecycleStatus === "pending_review" || lifecycleStatus === "under_review") return "Under Review";
  if (["voting_open", "voting_closed", "winners_announced", "completed"].includes(lifecycleStatus)) {
    return lifecycleStatus === "voting_open" ? "Voting Open" : "Voting Closed";
  }

  const registrationDeadline = endOfDay(String((challenge as Record<string, unknown>).registrationDeadline ?? ""));
  const startsAt = startOfDay(String((challenge as Record<string, unknown>).startsAt ?? ""));
  const endsAt = endOfDay(String((challenge as Record<string, unknown>).endsAt ?? ""));
  const votingEndsAt = addDays(endsAt, 7);

  if (!isValidDate(registrationDeadline) || !isValidDate(startsAt) || !isValidDate(endsAt)) {
    if (lifecycleStatus === "submission_open" || lifecycleStatus === "active") return "Active";
    if (lifecycleStatus === "scheduled") return "Open";
    return "Closed";
  }

  if (now <= registrationDeadline) return "Open";
  if (now >= startsAt && now <= endsAt) {
    const msUntilClose = endsAt.getTime() - now.getTime();
    return msUntilClose <= 1000 * 60 * 60 * 24 * 2 ? "Closing Soon" : "Active";
  }
  if (now > endsAt && now <= votingEndsAt) return "Voting Open";
  if (now > votingEndsAt) return "Voting Closed";
  return "Closed";
}

export function canJoinChallenge(challenge: Challenge | Record<string, unknown>, now = new Date()) {
  const lifecycleStatus = normalizeChallengeLifecycleStatus((challenge as Record<string, unknown>).status);
  if (["draft", "pending_review", "voting_open", "voting_closed", "under_review", "winners_announced", "completed", "cancelled", "paused"].includes(lifecycleStatus)) return false;
  const status = getChallengeDisplayStatus(challenge, now);
  return status === "Open" || status === "Active" || status === "Closing Soon";
}

export function canVoteOnChallenge(challenge: Challenge | Record<string, unknown>, now = new Date()) {
  const lifecycleStatus = normalizeChallengeLifecycleStatus((challenge as Record<string, unknown>).status);
  if (!["active", "submission_open", "voting_open", "voting_closed"].includes(lifecycleStatus)) return false;
  const status = getChallengeDisplayStatus(challenge, now);
  return status === "Active" || status === "Closing Soon" || status === "Voting Open";
}

export function statusClassName(status: ChallengeDisplayStatus) {
  if (status === "Open" || status === "Active") return "bg-emerald-500 text-black";
  if (status === "Closing Soon") return "bg-yellow-400 text-black";
  if (status === "Voting Open") return "bg-indigo-500 text-white";
  if (status === "Under Review") return "bg-yellow-500 text-black";
  return "bg-slate-700 text-white";
}

function startOfDay(value: string) {
  return new Date(`${value}T00:00:00`);
}

function endOfDay(value: string) {
  return new Date(`${value}T23:59:59`);
}

function addDays(date: Date, days: number) {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

function isValidDate(date: Date) {
  return !Number.isNaN(date.getTime());
}
