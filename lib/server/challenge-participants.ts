import type { Firestore } from "firebase-admin/firestore";
import { buildChallengeLeaderboard, type LeaderboardResult, type LeaderboardRow } from "@/lib/server/leaderboard";
import { isQaDemoOrPlaceholderProfile } from "@/lib/server/public-challenge";
import { predictionWindowState } from "@/lib/server/predictions";

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
  rank: number;
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
    if (profile.publicProfile === false || profile.status === "suspended" || isQaDemoOrPlaceholderProfile(snapshot.id, profile)) return [];
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
  } = {}
) {
  const leaderboard = await buildChallengeLeaderboard(db, challengeId, { limit: 250, includeEligibleEntries: true });
  const profiles = await loadPublicProfiles(db, leaderboard.entries);
  const exactVoteCountVisible = leaderboard.visible && !predictionRankingOnly(leaderboard.challenge, leaderboard.entries.length);
  const search = text(options.search).toLowerCase();
  const sort = options.sort === "newest" ? "newest" : "highest_votes";
  const pageSize = Math.min(48, Math.max(1, Math.trunc(options.pageSize ?? 12)));
  const page = Math.max(1, Math.trunc(options.page ?? 1));

  const allEntries = leaderboard.entries.map((row): PublicChallengeParticipant => {
    const userId = text(row.userId);
    const profile = userId ? profiles.get(userId) : null;
    const username = text(profile?.username ?? row.username) || null;
    const displayName = text(profile?.displayName ?? profile?.name ?? row.displayName) || "Participant";
    const avatarUrl = text(profile?.avatarUrl ?? profile?.photoURL ?? row.avatarUrl) || null;
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
  const eligibleTotal = allEntries.length;
  const entries = allEntries.filter((entry) => !search || `${entry.displayName} ${entry.username ?? ""} ${entry.submissionTitle}`.toLowerCase().includes(search));

  if (sort === "newest") {
    entries.sort((a, b) => Date.parse(b.submittedAt ?? "") - Date.parse(a.submittedAt ?? "") || a.rank - b.rank);
  }

  const total = entries.length;
  const start = (page - 1) * pageSize;
  return {
    challenge: leaderboard.challenge,
    leaderboard: publicLeaderboardState(leaderboard),
    entries: entries.slice(start, start + pageSize),
    pagination: { page, pageSize, total, hasMore: start + pageSize < total },
    eligibleTotal,
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
