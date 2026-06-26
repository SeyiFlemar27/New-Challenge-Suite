import type { Firestore } from "firebase-admin/firestore";
import { buildChallengeLeaderboard, type LeaderboardRow } from "@/lib/server/leaderboard";

export const winnerStatuses = [
  "pending_review",
  "verified",
  "disqualified",
  "replaced",
  "announced",
  "payout_pending",
  "payout_processing",
  "paid",
  "failed_payout"
] as const;

export type WinnerStatus = (typeof winnerStatuses)[number];

export interface WinnerResultRecord {
  id: string;
  challengeId: string;
  submissionId: string;
  userId: string;
  position: number;
  rank: number;
  status: WinnerStatus;
  prizeAmount: number | null;
  currency: string | null;
  payoutStatus: string;
  verifiedAt: string | null;
  announcedAt: string | null;
  createdAt: string | null;
  updatedAt: string | null;
  source: "stored" | "derived_preview" | "submission_flag";
  resultMessage: string;
  isFinal: boolean;
  challenge?: Record<string, unknown> | null;
  submission?: Record<string, unknown> | null;
  userName?: string;
  userInitials?: string;
  userPlanId?: string;
  title?: string;
  mediaUrl?: string;
  mediaType?: string;
  voteCount?: number;
  weightedVoteCount?: number;
  challengeTitle?: string;
  challengeCategory?: string;
  challengeEndsAt?: unknown;
  prizeType?: unknown;
  sponsored?: boolean;
}

function toIso(value: unknown): string | null {
  if (!value) return null;
  if (typeof value === "string") return value;
  if (value instanceof Date) return value.toISOString();
  if (typeof value === "object" && "toDate" in value && typeof value.toDate === "function") return value.toDate().toISOString();
  return null;
}

function numberOrNull(value: unknown) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : null;
}

function normalizeStatus(status: unknown): WinnerStatus {
  const value = String(status ?? "").toLowerCase();
  if (winnerStatuses.includes(value as WinnerStatus)) return value as WinnerStatus;
  if (value === "confirmed") return "announced";
  if (value === "approved") return "verified";
  if (value === "pending") return "pending_review";
  return "pending_review";
}

export function isChallengeWinnerReviewRequired(challenge: Record<string, unknown> = {}) {
  const visibility = String(challenge.visibility ?? challenge.type ?? "public").toLowerCase();
  const prizeType = String(challenge.prizeType ?? "").toLowerCase();
  const competitionFormat = String(challenge.competitionFormat ?? "").toLowerCase();
  const sponsored = Boolean(challenge.sponsorEnabled || challenge.sponsored || challenge.sponsorshipEnabled || challenge.enableSponsorship);
  const prizePool = Number(challenge.prizePool ?? challenge.prizePoolCents ?? 0);
  const premium = Boolean(challenge.premiumOnly) || visibility.includes("premium");
  const privateChallenge = visibility.includes("private") || visibility.includes("exclusive");
  const prize = prizePool > 0 || (prizeType && !prizeType.includes("bragging"));
  const advanced = competitionFormat.includes("bracket") || competitionFormat.includes("tournament") || competitionFormat.includes("head-to-head");
  return sponsored || prize || premium || privateChallenge || advanced;
}

function safePrizeAmount(record: Record<string, unknown>, challenge: Record<string, unknown> | null) {
  const explicit = numberOrNull(record.prizeAmount ?? record.prizeAmountCents);
  if (explicit) return explicit;
  if (!challenge) return null;
  if (isChallengeWinnerReviewRequired(challenge)) return null;
  return null;
}

export function resultMessageFor(status: WinnerStatus, reviewRequired: boolean) {
  if (reviewRequired && status === "pending_review") return "Results are being reviewed before winners are announced.";
  if (status === "pending_review") return "Winner results are pending review.";
  if (status === "announced") return "Winner has been announced.";
  if (status === "verified") return "Winner has been verified.";
  if (status === "disqualified") return "Winner result was disqualified.";
  if (status === "replaced") return "Winner result was replaced after review.";
  if (status.startsWith("payout") || status === "paid" || status === "failed_payout") return "Payout status is a placeholder foundation only in this version.";
  return "Winner result loaded.";
}

export function normalizeWinnerRecord(input: {
  winner?: Record<string, unknown> | null;
  submission?: Record<string, unknown> | null;
  challenge?: Record<string, unknown> | null;
  profile?: Record<string, unknown> | null;
  row?: LeaderboardRow | null;
  position?: number;
  source?: WinnerResultRecord["source"];
}): WinnerResultRecord {
  const winner = input.winner ?? {};
  const submission = input.submission ?? {};
  const challenge = input.challenge ?? null;
  const profile = input.profile ?? {};
  const row = input.row ?? null;
  const position = Number(winner.position ?? winner.rank ?? input.position ?? row?.rank ?? 1);
  const reviewRequired = challenge ? isChallengeWinnerReviewRequired(challenge) : false;
  const storedStatus = normalizeStatus(winner.status ?? submission.winnerStatus ?? submission.status);
  const status = input.source === "derived_preview" && reviewRequired ? "pending_review" : storedStatus === "pending_review" && !reviewRequired && input.source === "derived_preview" ? "announced" : storedStatus;
  const challengeId = String(winner.challengeId ?? submission.challengeId ?? row?.challengeId ?? challenge?.id ?? "");
  const submissionId = String(winner.submissionId ?? submission.id ?? row?.submissionId ?? row?.id ?? "");
  const userId = String(winner.userId ?? submission.userId ?? row?.userId ?? "");
  const displayName = String(submission.userName ?? submission.userDisplayName ?? row?.displayName ?? profile.displayName ?? "Participant");

  return {
    id: String(winner.id ?? (input.source === "derived_preview" ? `preview-${challengeId}-${submissionId}-${position}` : submissionId)),
    challengeId,
    submissionId,
    userId,
    position,
    rank: position,
    status,
    prizeAmount: safePrizeAmount(winner, challenge),
    currency: typeof winner.currency === "string" ? winner.currency : null,
    payoutStatus: String(winner.payoutStatus ?? (status === "payout_pending" ? "pending_review" : "not_applicable")),
    verifiedAt: toIso(winner.verifiedAt),
    announcedAt: toIso(winner.announcedAt ?? (status === "announced" ? winner.updatedAt ?? winner.createdAt : null)),
    createdAt: toIso(winner.createdAt ?? submission.createdAt),
    updatedAt: toIso(winner.updatedAt ?? submission.updatedAt),
    source: input.source ?? "stored",
    resultMessage: resultMessageFor(status, reviewRequired),
    isFinal: ["verified", "announced", "paid"].includes(status),
    challenge,
    submission,
    userName: displayName,
    userInitials: String(submission.userInitials ?? row?.initials ?? profile.initials ?? displayName.slice(0, 2).toUpperCase()),
    userPlanId: typeof submission.userPlanId === "string" ? submission.userPlanId : typeof profile.planId === "string" ? profile.planId : undefined,
    title: String(submission.title ?? row?.title ?? "Winner Entry"),
    mediaUrl: typeof submission.mediaUrl === "string" ? submission.mediaUrl : row?.mediaUrl,
    mediaType: typeof submission.mediaType === "string" ? submission.mediaType : row?.mediaType,
    voteCount: Number(submission.voteCount ?? row?.voteCount ?? row?.votes ?? 0),
    weightedVoteCount: Number(submission.weightedVoteCount ?? row?.weightedVoteCount ?? row?.points ?? 0),
    challengeTitle: String(submission.challengeTitle ?? challenge?.title ?? ""),
    challengeCategory: String(submission.challengeCategory ?? challenge?.category ?? ""),
    challengeEndsAt: challenge?.endsAt ?? null,
    prizeType: challenge?.prizeType ?? null,
    sponsored: Boolean(challenge?.sponsorEnabled || challenge?.sponsored || challenge?.sponsorshipEnabled || challenge?.enableSponsorship)
  };
}

export async function enrichWinnerRecord(db: Firestore, winner: Record<string, unknown>, source: WinnerResultRecord["source"] = "stored") {
  const submissionId = String(winner.submissionId ?? "");
  const submissionSnap = submissionId ? await db.collection("submissions").doc(submissionId).get() : null;
  const submission = submissionSnap?.exists ? { id: submissionSnap.id, ...submissionSnap.data(), ...winner } : winner;
  const challengeId = String(submission.challengeId ?? winner.challengeId ?? "");
  const userId = String(submission.userId ?? winner.userId ?? "");
  const [challengeSnap, profileSnap] = await Promise.all([
    challengeId ? db.collection("challenges").doc(challengeId).get() : Promise.resolve(null),
    userId ? db.collection("profiles").doc(userId).get() : Promise.resolve(null)
  ]);
  return normalizeWinnerRecord({
    winner,
    submission,
    challenge: challengeSnap?.exists ? { id: challengeSnap.id, ...challengeSnap.data() } : null,
    profile: profileSnap?.exists ? { id: profileSnap.id, ...profileSnap.data() } : null,
    source
  });
}

export async function deriveSafePreviewWinners(db: Firestore, limitChallenges = 24) {
  const challengesSnap = await db.collection("challenges").where("status", "in", ["completed", "winners_announced"]).limit(limitChallenges).get();
  const groups = await Promise.all(challengesSnap.docs.map(async (challengeDoc) => {
    const challenge = { id: challengeDoc.id, ...challengeDoc.data() } as Record<string, unknown>;
    const reviewRequired = isChallengeWinnerReviewRequired(challenge);
    const leaderboard = await buildChallengeLeaderboard(db, challengeDoc.id, { limit: 3 });
    const rows = leaderboard.entries.slice(0, 3);
    if (!rows.length) return null;
    return Promise.all(rows.map(async (row, index) => {
      const submissionSnap = row.submissionId ? await db.collection("submissions").doc(row.submissionId).get() : null;
      const submission = submissionSnap?.exists ? { id: submissionSnap.id, ...submissionSnap.data() } : row as unknown as Record<string, unknown>;
      const profileSnap = row.userId ? await db.collection("profiles").doc(row.userId).get() : null;
      return normalizeWinnerRecord({
        winner: {
          id: `preview-${challengeDoc.id}-${row.submissionId}`,
          challengeId: challengeDoc.id,
          submissionId: row.submissionId,
          userId: row.userId,
          position: index + 1,
          rank: index + 1,
          status: reviewRequired ? "pending_review" : "announced",
          payoutStatus: "not_applicable",
          prizeAmount: null,
          currency: null,
          createdAt: challenge.updatedAt ?? submission.createdAt,
          updatedAt: challenge.updatedAt ?? submission.updatedAt
        },
        submission,
        challenge,
        profile: profileSnap?.exists ? { id: profileSnap.id, ...profileSnap.data() } : null,
        row,
        position: index + 1,
        source: "derived_preview"
      });
    }));
  }));
  return groups.flat().filter(Boolean) as WinnerResultRecord[];
}


