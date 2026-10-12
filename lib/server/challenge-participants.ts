import type { Firestore } from "firebase-admin/firestore";
import { buildChallengeLeaderboard, type LeaderboardResult, type LeaderboardRow } from "@/lib/server/leaderboard";
import { isQaDemoOrPlaceholderProfile } from "@/lib/server/public-challenge";
import { predictionWindowState } from "@/lib/server/predictions";
import { normalizeLeaderboardSearch } from "@/lib/server/leaderboard-search";

export type ParticipantSort = "highest_votes" | "newest";

export interface PublicChallengeParticipant {
  id: string;
  submissionId: string;
  displayName: string;
  username: string | null;
  avatarUrl: string | null;
  profilePath: string | null;
  submissionTitle: string;
  submissionMediaUrl: string | null;
  submissionMediaType: string | null;
  submissionPath: string;
  status: string;
  rank: number | null;
  voteCount: number | null;
  exactVoteCountVisible: boolean;
  submittedAt: string | null;
}

function text(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function predictionRankingOnly(challenge: Record<string, unknown> | null, eligibleSubmissionCount: number) {
  if (!challenge) return false;
  return predictionWindowState(challenge, new Date(), eligibleSubmissionCount).rankingOnly;
}

async function loadPublicProfiles(db: Firestore, rows: LeaderboardRow[]) {
  const ids = [...new Set(rows.map((row) => text(row.userId)).filter(Boolean))];
  const snapshots = await Promise.all(ids.map((id) => db.collection("profiles").doc(id).get()));
  return new Map(snapshots.flatMap((snapshot) => {
    if (!snapshot.exists) return [];
    const profile = snapshot.data() ?? {};
    if (profile.publicProfile === false || profile.profileVisibility === "private" || profile.status === "suspended" || isQaDemoOrPlaceholderProfile(snapshot.id, profile)) return [];
    return [[snapshot.id, profile] as const];
  }));
}

export async function buildPublicChallengeParticipants(
  db: Firestore,
  challengeId: string,
  options: {
    search?: string;
    sort?: ParticipantSort;
    page?: number;
    pageSize?: number;
    cursor?: string | null;
  } = {}
) {
  const search = normalizeLeaderboardSearch(options.search);
  const leaderboard = await buildChallengeLeaderboard(db, challengeId, {
    page: options.page,
    pageSize: options.pageSize,
    cursor: options.cursor,
    searchPrefix: search || undefined,
    sort: options.sort === "newest" ? "newest" : "highest_votes"
  });
  const profiles = await loadPublicProfiles(db, leaderboard.entries);
  const exactVoteCountVisible = leaderboard.exactVoteCountVisible === true && !predictionRankingOnly(leaderboard.challenge, leaderboard.pagination?.total ?? 0);
  const sort = options.sort === "newest" ? "newest" : "highest_votes";
  const pageSize = Math.min(48, Math.max(1, Math.trunc(options.pageSize ?? 12)));
  const page = Math.max(1, Math.trunc(options.page ?? 1));

  const allEntries = leaderboard.entries.map((row): PublicChallengeParticipant => {
    const userId = text(row.userId);
    const profile = userId ? profiles.get(userId) : null;
    const username = profile ? text(profile.username) || null : null;
    const displayName = profile ? text(profile.displayName ?? profile.name ?? profile.username) || "Participant" : "Participant";
    const avatarUrl = profile ? text(profile.avatarUrl ?? profile.photoURL) || null : null;
    const submissionId = text(row.submissionId ?? row.id);
    return {
      id: submissionId,
      submissionId,
      displayName,
      username,
      avatarUrl,
      profilePath: username ? `/profile/${encodeURIComponent(username)}` : null,
      submissionTitle: text(row.title) || "Challenge entry",
      submissionMediaUrl: text(row.mediaUrl) || null,
      submissionMediaType: text(row.mediaType) || null,
      submissionPath: `/submissions/${encodeURIComponent(submissionId)}`,
      status: text(row.status) || "approved",
      rank: row.rank,
      voteCount: exactVoteCountVisible ? Number(row.voteCount ?? 0) : null,
      exactVoteCountVisible,
      submittedAt: row.submittedAt ?? row.createdAt ?? null
    };
  });
  const eligibleTotal = Number(leaderboard.pagination?.eligibleTotal ?? leaderboard.pagination?.total ?? 0);
  const entries = allEntries;
  const total = Number(leaderboard.pagination?.total ?? 0);
  return {
    challenge: leaderboard.challenge,
    leaderboard: publicLeaderboardState(leaderboard),
    entries,
    participantDiscoveryAllowed: leaderboard.participantDiscoveryAllowed !== false,
    pagination: { page, pageSize: Number(leaderboard.pagination?.pageSize ?? pageSize), total, hasMore: Boolean(leaderboard.pagination?.hasMore), nextCursor: leaderboard.pagination?.nextCursor ?? null },
    eligibleTotal,
    hasVerifiedVotes: leaderboard.hasVerifiedVotes === true,
    sort,
    search,
    exactVoteCountVisible
  };
}

function publicLeaderboardState(leaderboard: LeaderboardResult) {
  return {
    status: leaderboard.status,
    visibilityMode: leaderboard.visibilityMode,
    visible: leaderboard.visible,
    message: leaderboard.message
  };
}
