import { FieldPath, type Firestore, type QueryDocumentSnapshot } from "firebase-admin/firestore";
import { canVoteOnChallenge } from "@/lib/challenge-status";
import { canSubmissionReceiveVotes } from "@/lib/server/submission-lifecycle";
import { isPublicSubmission, isQaDemoOrPlaceholderProfile } from "@/lib/server/public-challenge";
import { challengeMediaDeliveryUrl, isFirebaseStorageDownloadUrl } from "@/lib/server/challenge-media-delivery";

export type LeaderboardType = "challenge" | "global" | "tournament";
export type ChallengeLeaderboardStatus = "live" | "hidden" | "locked" | "under_review" | "final" | "disputed" | "archived";
export type LeaderboardVisibilityMode = "public_live" | "hidden_until_close" | "top_10_only" | "private_review";

export interface LeaderboardRow {
  id: string;
  rank: number | null;
  previousRank: number | null;
  rankChange: number;
  submissionId?: string;
  challengeId?: string;
  userId?: string;
  username?: string;
  avatarUrl?: string;
  profilePath?: string;
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
  competitionMode?: "public_voting" | "judges" | "tournament" | "global";
  hasVerifiedVotes?: boolean;
  participantDiscoveryAllowed?: boolean;
  exactVoteCountVisible?: boolean;
  pagination?: { page: number; pageSize: number; total: number; totalPages: number; hasMore?: boolean; nextCursor?: string | null; eligibleTotal?: number };
  currentUserPosition?: LeaderboardRow | null;
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
  if (challenge.hideRankings === true) return "hidden_until_close";
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
  const voteDiff = numberValue(b.voteCount) - numberValue(a.voteCount);
  if (voteDiff !== 0) return voteDiff;
  const reachedDiff = timestampMs(a.leaderboardSortAt ?? a.scoreReachedAt ?? a.voteTotalReachedAt ?? a.approvedAt ?? a.submittedAt ?? a.createdAt) - timestampMs(b.leaderboardSortAt ?? b.scoreReachedAt ?? b.voteTotalReachedAt ?? b.approvedAt ?? b.submittedAt ?? b.createdAt);
  if (reachedDiff !== 0) return reachedDiff;
  const submittedDiff = timestampMs(a.approvedAt ?? a.submittedAt ?? a.createdAt) - timestampMs(b.approvedAt ?? b.submittedAt ?? b.createdAt);
  if (submittedDiff !== 0) return submittedDiff;
  return String(a.id ?? a.submissionId ?? "").localeCompare(String(b.id ?? b.submissionId ?? ""));
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
        userId: String(submission.userId ?? submission.participantId ?? ""),
        displayName,
        name: displayName,
        username: typeof submission.username === "string" ? submission.username : undefined,
        avatarUrl: typeof submission.avatarUrl === "string" ? submission.avatarUrl : typeof submission.userAvatarUrl === "string" ? submission.userAvatarUrl : undefined,
        initials: String(submission.userInitials ?? displayName.slice(0, 2).toUpperCase()),
        title: String(submission.title ?? "Untitled Submission"),
        mediaUrl: typeof submission.mediaStoragePath === "string" && submission.mediaStoragePath.trim()
          ? challengeMediaDeliveryUrl(submission.mediaStoragePath.trim())
          : typeof submission.mediaUrl === "string" && !isFirebaseStorageDownloadUrl(submission.mediaUrl) ? submission.mediaUrl : undefined,
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

export async function buildChallengeLeaderboard(db: Firestore, challengeId: string, options: { page?: number; pageSize?: number; limit?: number; cursor?: string | null; searchPrefix?: string; sort?: "highest_votes" | "newest" } = {}): Promise<LeaderboardResult & { challenge: Record<string, unknown> | null }> {
  const page = Math.max(1, options.page ?? 1);
  const pageSize = Math.min(36, Math.max(1, options.pageSize ?? options.limit ?? 36));
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
      participantDiscoveryAllowed: false,
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
  const effectivePageSize = visibilityMode === "top_10_only" ? Math.min(pageSize, 10) : pageSize;
  const visible = isLeaderboardVisible(status, visibilityMode, votingOpen);
  const message = visibilityMessage(status, visibilityMode, votingOpen);
  const judgesMode = [challenge.winnerSelection, challenge.votingMode, challenge.scoringMode].some((value) => String(value ?? "").toLowerCase().includes("judge")) || challenge.judgeScoringEnabled === true;
  const submissions = db.collection("submissions");
  const baseQuery = submissions
    .where("challengeId", "==", challengeId)
    .where("leaderboardEligible", "==", true)
    .where("visibility", "==", "public");
  const filteredQuery = options.searchPrefix ? baseQuery.where("leaderboardSearchPrefixes", "array-contains", options.searchPrefix) : baseQuery;
  const [eligibleTotalSnap, totalSnap, verifiedVotesSnap] = await Promise.all([
    baseQuery.count().get(),
    filteredQuery.count().get(),
    db.collection("votes").where("challengeId", "==", challengeId).where("status", "==", "counted").count().get()
  ]);
  const candidateTotal = totalSnap.data().count;
  const total = visibilityMode === "top_10_only" ? Math.min(candidateTotal, 10) : candidateTotal;
  const eligibleTotal = visibilityMode === "top_10_only" ? Math.min(eligibleTotalSnap.data().count, 10) : eligibleTotalSnap.data().count;
  const hasVerifiedVotes = verifiedVotesSnap.data().count > 0;
  const participantDiscoveryAllowed = !["hidden", "archived", "disputed", "under_review"].includes(status)
    && visibilityMode !== "private_review";
  const rankingAllowed = visible && hasVerifiedVotes && participantDiscoveryAllowed;
  const exactVoteCountVisible = visible
    && hasVerifiedVotes
    && challenge.hideVoteTotals !== true
    && (visibilityMode !== "top_10_only" || !votingOpen);
  const requestedSort = options.sort === "newest" ? "newest" : "highest_votes";
  const rankOrderAllowed = rankingAllowed && requestedSort === "highest_votes";
  // A hidden board must not reveal rank order through its query order, page contents,
  // cursors, or positional metadata. Use a neutral submission-time order instead.
  const effectiveSort = rankOrderAllowed ? requestedSort : "newest";
  let query = effectiveSort === "newest"
    ? filteredQuery.orderBy("submittedAt", "desc").orderBy(FieldPath.documentId(), "desc")
    : filteredQuery.orderBy("voteCount", "desc").orderBy("leaderboardSortAt", "asc").orderBy("submittedAt", "asc").orderBy(FieldPath.documentId(), "asc");
  let start = (page - 1) * effectivePageSize;
  if (options.cursor) {
    let cursorPayload: { id?: unknown; rank?: unknown };
    try {
      cursorPayload = JSON.parse(Buffer.from(options.cursor, "base64url").toString("utf8")) as { id?: unknown; rank?: unknown };
    } catch {
      throw new Error("INVALID_CHALLENGE_LEADERBOARD_CURSOR");
    }
    if (typeof cursorPayload.id !== "string" || !Number.isSafeInteger(cursorPayload.rank) || Number(cursorPayload.rank) < 1) {
      throw new Error("INVALID_CHALLENGE_LEADERBOARD_CURSOR");
    }
    const cursorSnap = await submissions.doc(cursorPayload.id).get();
    const cursorData = cursorSnap.data() ?? {};
    if (!cursorSnap.exists || cursorData.challengeId !== challengeId || cursorData.leaderboardEligible !== true || cursorData.visibility !== "public" || (options.searchPrefix && !Array.isArray(cursorData.leaderboardSearchPrefixes) || options.searchPrefix && !(cursorData.leaderboardSearchPrefixes as unknown[]).includes(options.searchPrefix))) {
      throw new Error("INVALID_CHALLENGE_LEADERBOARD_CURSOR");
    }
    query = query.startAfter(cursorSnap as QueryDocumentSnapshot);
    start = Number(cursorPayload.rank) - 1;
  } else if (start > 0) {
    query = query.offset(start);
  }
  const maxVisibleEntries = Math.max(0, total - start);
  const queryLimit = visibilityMode === "top_10_only"
    ? Math.min(effectivePageSize, maxVisibleEntries)
    : effectivePageSize + 1;
  const submissionSnap = participantDiscoveryAllowed && queryLimit > 0
    ? await query.limit(queryLimit).get()
    : { docs: [] as QueryDocumentSnapshot[] };
  const hasMore = visibilityMode === "top_10_only"
    ? start + submissionSnap.docs.length < total
    : submissionSnap.docs.length > effectivePageSize;
  const pageDocs = (hasMore ? submissionSnap.docs.slice(0, effectivePageSize) : submissionSnap.docs)
    .filter((doc) => isPublicSubmission(doc.id, doc.data()));
  const candidateRows = pageDocs.map((doc) => ({ id: doc.id, ...doc.data() } as Record<string, unknown>));
  const filteredRows = rankSubmissions(candidateRows);
  const sortedRows = effectiveSort === "newest"
    ? [...filteredRows].sort((a, b) => timestampMs(b.submittedAt) - timestampMs(a.submittedAt) || b.id.localeCompare(a.id))
    : filteredRows;
  const visibleEntries = !exactVoteCountVisible
      ? sortedRows.map((entry) => ({ ...entry, voteCount: 0, weightedVoteCount: 0, votes: undefined, points: undefined }))
      : sortedRows;
  const rankOffset = start;
  const rankedPage = visibleEntries.map((entry, index) => ({ ...entry, rank: rankOrderAllowed ? rankOffset + index + 1 : null }));
  const pageCursor = hasMore && pageDocs.length ? pageDocs.at(-1)!.id : null;
  const nextCursor = pageCursor ? Buffer.from(JSON.stringify({ id: pageCursor, rank: rankOffset + rankedPage.length + 1 }), "utf8").toString("base64url") : null;
  return {
    type: "challenge",
    board: challengeId,
    challengeId,
    challenge,
    status,
    visibilityMode,
    visible,
    participantDiscoveryAllowed,
    exactVoteCountVisible,
    message,
    entries: rankedPage,
    hasVerifiedVotes,
    source: "submissions",
    updatedAt: toIso(challenge.updatedAt),
    competitionMode: judgesMode ? "judges" : "public_voting",
    pagination: { page, pageSize: effectivePageSize, total, totalPages: Math.max(1, Math.ceil(total / effectivePageSize)), hasMore, nextCursor, eligibleTotal }
  };
}

export async function buildGlobalLeaderboard(db: Firestore, options: { page?: number; pageSize?: number; period?: "week" | "month" | "all"; currentUserId?: string | null } = {}): Promise<LeaderboardResult> {
  const page = Math.max(1, options.page ?? 1);
  const pageSize = Math.min(36, Math.max(1, options.pageSize ?? 36));
  const now = new Date();
  const cutoff = options.period === "week" ? now.getTime() - 7 * 24 * 60 * 60 * 1000 : options.period === "month" ? Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1) : 0;
  const [winnerSnap, voteSnap] = await Promise.all([db.collection("winners").limit(2500).get(), db.collection("votes").where("status", "==", "counted").limit(10000).get()]);
  const wins = new Map<string, number>();
  const votes = new Map<string, number>();
  winnerSnap.docs.forEach((doc) => { const row = doc.data(); const time = timestampMs(row.verifiedAt ?? row.announcedAt ?? row.createdAt); if (cutoff && time < cutoff) return; if (!["verified", "announced", "paid", "approved", "final"].includes(String(row.status ?? "").toLowerCase())) return; const userId = String(row.userId ?? ""); if (userId) wins.set(userId, (wins.get(userId) ?? 0) + 1); });
  voteSnap.docs.forEach((doc) => { const row = doc.data(); const time = timestampMs(row.createdAt); if (cutoff && time < cutoff) return; const userId = String(row.submissionOwnerId ?? ""); if (userId) votes.set(userId, (votes.get(userId) ?? 0) + 1); });
  const userIds = [...new Set([...wins.keys(), ...votes.keys()])];
  const profileSnaps = userIds.length ? await db.getAll(...userIds.map((id) => db.collection("profiles").doc(id))) : [];
  const allEntries = profileSnaps.flatMap((doc) => {
    const profile = doc.data() ?? {};
    if (isQaDemoOrPlaceholderProfile(doc.id, profile) || profile.publicProfile === false || profile.status === "suspended") return [];
    const displayName = String(profile.displayName ?? profile.name ?? "Challenge Suite Member");
    const winCount = wins.get(doc.id) ?? 0;
    const validVotes = votes.get(doc.id) ?? 0;
    return [{ id: doc.id, userId: doc.id, displayName, name: displayName, initials: String(profile.initials ?? displayName.slice(0, 2).toUpperCase()), avatarUrl: typeof profile.avatarUrl === "string" ? profile.avatarUrl : undefined, planId: typeof profile.planId === "string" ? profile.planId : "free", badgeStyleId: typeof profile.customization?.profileBadgeId === "string" ? profile.customization.profileBadgeId : undefined, points: winCount * 1000 + validVotes, wins: winCount, votes: validVotes, voteCount: validVotes, weightedVoteCount: validVotes, previousRank: null, rankChange: 0, rank: 0 } satisfies LeaderboardRow];
  }).filter((row) => Number(row.points ?? 0) > 0).sort((a, b) => Number(b.points ?? 0) - Number(a.points ?? 0) || Number(b.wins ?? 0) - Number(a.wins ?? 0) || Number(b.votes ?? 0) - Number(a.votes ?? 0) || a.id.localeCompare(b.id)).map((row, index) => ({ ...row, rank: index + 1 }));
  const start = (page - 1) * pageSize;
  const entries = allEntries.slice(start, start + pageSize);
  const currentUserPosition = options.currentUserId ? allEntries.find((row) => row.userId === options.currentUserId) ?? null : null;

  return {
    type: "global",
    board: "global",
    status: "global",
    visibilityMode: "public",
    visible: true,
    message: entries.length ? null : "No real leaderboard entries are available yet.",
    entries,
    source: "confirmed_winners_and_counted_votes",
    updatedAt: null,
    competitionMode: "global",
    pagination: { page, pageSize, total: allEntries.length, totalPages: Math.max(1, Math.ceil(allEntries.length / pageSize)) },
    currentUserPosition: currentUserPosition && currentUserPosition.rank > 3 ? currentUserPosition : null
  };
}

export async function buildTournamentLeaderboard(db: Firestore, tournamentId: string, options: { page?: number; pageSize?: number } = {}): Promise<LeaderboardResult> {
  const page = Math.max(1, options.page ?? 1);
  const pageSize = Math.min(36, Math.max(1, options.pageSize ?? 36));
  const [tournamentSnap, participantSnap, matchSnap, placementSnap] = await Promise.all([
    db.collection("tournaments").doc(tournamentId).get(),
    db.collection("tournamentParticipants").where("tournamentId", "==", tournamentId).limit(1000).get(),
    db.collection("tournamentMatches").where("tournamentId", "==", tournamentId).limit(1000).get(),
    db.collection("tournamentPlacements").where("tournamentId", "==", tournamentId).limit(20).get()
  ]);
  if (!tournamentSnap.exists) return { type: "tournament", board: tournamentId, challengeId: tournamentId, status: "archived", visibilityMode: "public", visible: false, message: "Tournament not found.", entries: [], source: "tournament", updatedAt: null, competitionMode: "tournament" };
  const tournament = tournamentSnap.data() ?? {};
  const matches = matchSnap.docs.map((doc) => doc.data());
  const placements = new Map(placementSnap.docs.map((doc) => [String(doc.data().participantId ?? doc.data().userId ?? ""), numberValue(doc.data().placement ?? doc.data().rank)]));
  const allEntries = participantSnap.docs.map((doc) => {
    const row = doc.data();
    const participantId = doc.id;
    const userId = String(row.userId ?? participantId);
    const wonMatches = matches.filter((match) => String(match.winnerParticipantId ?? "") === participantId).length;
    const lostMatches = matches.filter((match) => String(match.loserParticipantId ?? "") === participantId).length;
    const placement = placements.get(participantId) ?? placements.get(userId) ?? 0;
    const displayName = String(row.displayName ?? row.userName ?? "Participant");
    return { id: participantId, userId, displayName, initials: String(row.initials ?? displayName.slice(0, 2).toUpperCase()), avatarUrl: typeof row.avatarUrl === "string" ? row.avatarUrl : undefined, voteCount: 0, weightedVoteCount: 0, points: numberValue(row.cumulativeScore), wins: wonMatches, submissions: lostMatches, status: String(row.status ?? "registered"), rank: placement, previousRank: null, rankChange: 0 } satisfies LeaderboardRow;
  }).sort((a, b) => (a.rank || Number.MAX_SAFE_INTEGER) - (b.rank || Number.MAX_SAFE_INTEGER) || Number(b.wins ?? 0) - Number(a.wins ?? 0) || Number(a.submissions ?? 0) - Number(b.submissions ?? 0) || Number(b.points ?? 0) - Number(a.points ?? 0) || a.id.localeCompare(b.id)).map((row, index) => ({ ...row, rank: row.rank || index + 1 }));
  const start = (page - 1) * pageSize;
  const final = ["completed", "winners_announced", "final"].includes(String(tournament.status ?? "").toLowerCase()) && placementSnap.size > 0;
  const underReview = ["under_review", "voting_closed", "completed"].includes(String(tournament.status ?? "").toLowerCase()) && !final;
  return { type: "tournament", board: tournamentId, challengeId: tournamentId, status: final ? "final" : underReview ? "under_review" : "live", visibilityMode: "public", visible: allEntries.length > 0, message: allEntries.length ? null : "Tournament standings will appear after confirmed participants and matchup results exist.", entries: allEntries.slice(start, start + pageSize), source: "tournament_matches_and_placements", updatedAt: toIso(tournament.updatedAt), competitionMode: "tournament", pagination: { page, pageSize, total: allEntries.length, totalPages: Math.max(1, Math.ceil(allEntries.length / pageSize)) } };
}
