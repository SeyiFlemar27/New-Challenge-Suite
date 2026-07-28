import type { Firestore } from "firebase-admin/firestore";
import { canVoteOnChallenge } from "@/lib/challenge-status";
import { canSubmissionReceiveVotes } from "@/lib/server/submission-lifecycle";
import { isPublicSubmission, isQaDemoOrPlaceholderProfile } from "@/lib/server/public-challenge";

export type LeaderboardType = "challenge" | "global" | "tournament";
export type ChallengeLeaderboardStatus = "live" | "hidden" | "locked" | "under_review" | "final" | "disputed" | "archived";
export type LeaderboardVisibilityMode = "public_live" | "hidden_until_close" | "top_10_only" | "private_review";

export interface LeaderboardRow {
  id: string;
  rank: number;
  previousRank: number | null;
  rankChange: number;
  submissionId?: string;
  challengeId?: string;
  userId?: string;
  displayName: string;
  name?: string;
  initials?: string;
  title?: string;
  mediaUrl?: string;
  mediaType?: string;
  voteCount: number;
  weightedVoteCount: number;
  votes?: number;
  points?: number;
  wins?: number;
  submissions?: number;
  status?: string;
  submittedAt?: string | null;
  createdAt?: string | null;
  planId?: string;
  badgeStyleId?: string;
}

export interface LeaderboardResult {
  type: LeaderboardType;
  board: string;
  challengeId?: string;
  status: ChallengeLeaderboardStatus | "global";
  visibilityMode: LeaderboardVisibilityMode | "public";
  visible: boolean;
  message: string | null;
  entries: LeaderboardRow[];
  source: string;
  updatedAt: string | null;
}

function toIso(value: unknown): string | null {
  if (!value) return null;
  if (typeof value === "string") return value;
  if (value instanceof Date) return value.toISOString();
  if (typeof value === "object" && "toDate" in value && typeof value.toDate === "function") return value.toDate().toISOString();
  return null;
}

function timestampMs(value: unknown) {
  const iso = toIso(value);
  if (!iso) return Number.MAX_SAFE_INTEGER;
  const ms = Date.parse(iso);
  return Number.isFinite(ms) ? ms : Number.MAX_SAFE_INTEGER;
}

function numberValue(value: unknown) {
  const number = Number(value ?? 0);
  return Number.isFinite(number) ? number : 0;
}

function getPreviousRank(row: Record<string, unknown>) {
  const rank = Number(row.previousRank ?? row.leaderboardPreviousRank ?? row.lastRank ?? 0);
  return Number.isFinite(rank) && rank > 0 ? rank : null;
}

export function resolveChallengeLeaderboardStatus(challenge: Record<string, unknown>): ChallengeLeaderboardStatus {
  const explicit = String(challenge.leaderboardStatus ?? "").toLowerCase();
  if (["live", "hidden", "locked", "under_review", "final", "disputed", "archived"].includes(explicit)) return explicit as ChallengeLeaderboardStatus;
  const disputeStatus = String(challenge.disputeStatus ?? "").toLowerCase();
  if (["open", "reviewing", "disputed"].includes(disputeStatus)) return "disputed";
  const status = String(challenge.status ?? "").toLowerCase();
  if (["under_review"].includes(status)) return "under_review";
  if (["winners_announced", "completed"].includes(status)) return "final";
  if (["voting_closed"].includes(status)) return "locked";
  if (["cancelled", "archived"].includes(status)) return "archived";
  if (["draft", "pending_review", "scheduled", "paused"].includes(status)) return "hidden";
  return canVoteOnChallenge(challenge) ? "live" : "locked";
}

export function resolveLeaderboardVisibilityMode(challenge: Record<string, unknown>): LeaderboardVisibilityMode {
  const value = String(challenge.leaderboardVisibilityMode ?? challenge.leaderboardVisibility ?? "public_live").toLowerCase();
  if (["public_live", "hidden_until_close", "top_10_only", "private_review"].includes(value)) return value as LeaderboardVisibilityMode;
  return "public_live";
}

function visibilityMessage(status: ChallengeLeaderboardStatus, mode: LeaderboardVisibilityMode, votingOpen: boolean) {
  if (mode === "private_review") return "Leaderboard is under review.";
  if (mode === "hidden_until_close" && votingOpen) return "Leaderboard hidden until voting closes.";
  if (status === "under_review") return "Final results will be shown after review.";
  if (status === "hidden") return "Leaderboard is not public yet.";
  if (status === "disputed") return "Leaderboard is disputed and under review.";
  if (status === "archived") return "Leaderboard has been archived.";
  return null;
}

export function isLeaderboardVisible(status: ChallengeLeaderboardStatus, mode: LeaderboardVisibilityMode, votingOpen: boolean) {
  if (mode === "private_review") return false;
  if (mode === "hidden_until_close" && votingOpen) return false;
  if (["hidden", "under_review", "disputed", "archived"].includes(status)) return false;
  return true;
}

function sortSubmissionRows(a: Record<string, unknown>, b: Record<string, unknown>) {
  const weightedDiff = numberValue(b.weightedVoteCount) - numberValue(a.weightedVoteCount);
  if (weightedDiff !== 0) return weightedDiff;
  const voteDiff = numberValue(b.voteCount) - numberValue(a.voteCount);
  if (voteDiff !== 0) return voteDiff;
  return timestampMs(a.submittedAt ?? a.createdAt) - timestampMs(b.submittedAt ?? b.createdAt);
}

function isEligibleLeaderboardSubmission(submission: Record<string, unknown>) {
  if (!canSubmissionReceiveVotes(submission.status)) return false;
  const participantStatus = String(submission.participantStatus ?? submission.enrollmentStatus ?? "approved").toLowerCase();
  if (["pending", "pending_payment", "pending_review", "rejected", "withdrawn", "disqualified", "incomplete"].includes(participantStatus)) return false;
  const accountType = String(submission.userAccountType ?? submission.accountType ?? submission.role ?? "user").toLowerCase();
  if (["sponsor", "brand"].includes(accountType)) return false;
  if (submission.isChallengeOwner === true || submission.ownerSubmission === true || submission.selfEntry === true) return false;
  const paidEntryRequired = submission.paidEntryRequired === true || submission.entryFeeRequired === true;
  const paymentStatus = String(submission.entryPaymentStatus ?? submission.paymentStatus ?? "not_required").toLowerCase();
  if (paidEntryRequired && !["paid", "confirmed"].includes(paymentStatus)) return false;
  return true;
}

export function rankSubmissions(submissions: Record<string, unknown>[], limit?: number): LeaderboardRow[] {
  const rows = submissions
    .filter(isEligibleLeaderboardSubmission)
    .sort(sortSubmissionRows)
    .map((submission, index) => {
      const rank = index + 1;
      const previousRank = getPreviousRank(submission);
      const displayName = String(submission.userName ?? submission.userDisplayName ?? submission.displayName ?? "Participant");
      return {
        id: String(submission.id ?? submission.submissionId ?? ""),
        submissionId: String(submission.id ?? submission.submissionId ?? ""),
        challengeId: String(submission.challengeId ?? ""),
        displayName,
        name: displayName,
        initials: String(submission.userInitials ?? displayName.slice(0, 2).toUpperCase()),
        title: String(submission.title ?? "Untitled Submission"),
        mediaUrl: typeof submission.mediaUrl === "string" ? submission.mediaUrl : undefined,
        mediaType: typeof submission.mediaType === "string" ? submission.mediaType : undefined,
        voteCount: numberValue(submission.voteCount ?? submission.likes),
        weightedVoteCount: numberValue(submission.weightedVoteCount ?? submission.voteCount ?? submission.likes),
        votes: numberValue(submission.voteCount ?? submission.likes),
        points: numberValue(submission.weightedVoteCount ?? submission.voteCount ?? submission.likes),
        status: String(submission.status ?? ""),
        submittedAt: toIso(submission.submittedAt),
        createdAt: toIso(submission.createdAt),
        planId: typeof submission.userPlanId === "string" ? submission.userPlanId : undefined,
        previousRank,
        rankChange: previousRank ? previousRank - rank : 0,
        rank
      } satisfies LeaderboardRow;
    });
  return typeof limit === "number" ? rows.slice(0, limit) : rows;
}

export async function buildChallengeLeaderboard(db: Firestore, challengeId: string, options: { limit?: number } = {}): Promise<LeaderboardResult & { challenge: Record<string, unknown> | null }> {
  const challengeSnap = await db.collection("challenges").doc(challengeId).get();
  if (!challengeSnap.exists) {
    return {
      type: "challenge",
      board: challengeId,
      challengeId,
      challenge: null,
      status: "archived",
      visibilityMode: "public_live",
      visible: false,
      message: "Challenge not found.",
      entries: [],
      source: "submissions",
      updatedAt: null
    };
  }
  const challenge = { id: challengeSnap.id, ...challengeSnap.data() } as Record<string, unknown>;
  const status = resolveChallengeLeaderboardStatus(challenge);
  const visibilityMode = resolveLeaderboardVisibilityMode(challenge);
  const votingOpen = canVoteOnChallenge(challenge);
  const visible = isLeaderboardVisible(status, visibilityMode, votingOpen);
  const message = visibilityMessage(status, visibilityMode, votingOpen);
  const submissionSnap = await db.collection("submissions")
    .where("challengeId", "==", challengeId)
    .orderBy("weightedVoteCount", "desc")
    .limit(250)
    .get();
  const rawSubmissions = submissionSnap.docs.flatMap((doc) => {
    const data = doc.data();
    return isPublicSubmission(doc.id, data) ? [{ id: doc.id, ...data } as Record<string, unknown>] : [];
  });
  const topLimit = visibilityMode === "top_10_only" ? 10 : options.limit;
  const entries = visible ? rankSubmissions(rawSubmissions, topLimit) : [];
  return {
    type: "challenge",
    board: challengeId,
    challengeId,
    challenge,
    status,
    visibilityMode,
    visible,
    message,
    entries,
    source: "submissions",
    updatedAt: toIso(challenge.updatedAt)
  };
}

export async function buildGlobalLeaderboard(db: Firestore, limit = 50): Promise<LeaderboardResult> {
  const profileSnap = await db.collection("profiles").limit(Math.max(limit * 4, 100)).get();
  const entries = profileSnap.docs
    .flatMap((doc) => {
      const profile = doc.data();
      if (isQaDemoOrPlaceholderProfile(doc.id, profile) || profile.publicProfile === false || profile.status === "suspended") return [];
      const displayName = String(profile.displayName ?? profile.name ?? "Challenge Suite Member");
      return [{
        id: doc.id,
        displayName,
        name: displayName,
        initials: String(profile.initials ?? displayName.slice(0, 2).toUpperCase()),
        planId: typeof profile.planId === "string" ? profile.planId : "free",
        badgeStyleId: typeof profile.customization?.profileBadgeId === "string" ? profile.customization.profileBadgeId : undefined,
        points: numberValue(profile.totalPoints ?? profile.points),
        wins: numberValue(profile.wins ?? profile.winnerCount),
        votes: numberValue(profile.voteCount ?? profile.votesCast),
        submissions: numberValue(profile.submissionCount),
        voteCount: numberValue(profile.voteCount ?? profile.votesCast),
        weightedVoteCount: numberValue(profile.totalPoints ?? profile.points),
        previousRank: getPreviousRank(profile),
        rankChange: 0,
        rank: 0
      } satisfies LeaderboardRow];
    })
    .filter((row) => row.points > 0 || Number(row.wins ?? 0) > 0 || Number(row.votes ?? 0) > 0 || Number(row.submissions ?? 0) > 0)
    .sort((a, b) => Number(b.points ?? 0) - Number(a.points ?? 0) || Number(b.wins ?? 0) - Number(a.wins ?? 0) || Number(b.votes ?? 0) - Number(a.votes ?? 0))
    .slice(0, limit)
    .map((row, index) => {
      const rank = index + 1;
      return { ...row, rank, rankChange: row.previousRank ? row.previousRank - rank : 0 };
    });

  return {
    type: "global",
    board: "global",
    status: "global",
    visibilityMode: "public",
    visible: true,
    message: entries.length ? null : "No real leaderboard entries are available yet.",
    entries,
    source: "profiles",
    updatedAt: null
  };
}
