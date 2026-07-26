export const TOURNAMENT_STATUSES = [
  "draft",
  "pending_review",
  "scheduled",
  "registration_open",
  "registration_closed",
  "seeding",
  "ready",
  "active",
  "round_active",
  "round_review",
  "final",
  "under_review",
  "winners_announced",
  "completed",
  "paused",
  "cancelled"
] as const;

export type TournamentStatus = typeof TOURNAMENT_STATUSES[number];
export type TournamentFormat = "single_elimination" | "double_elimination" | "round_robin" | "group_stage_to_final" | "league" | "hybrid";
export type TournamentPrivacy = "public" | "private" | "invite_only";
export type TournamentRegistrationType = "open" | "approval_required" | "invite_only";
export type TournamentEntryType = "free" | "paid_entry_setup_required";
export type TournamentSeedingMethod = "manual" | "random" | "registration_order" | "ranking";
export type TournamentResultMethod = "votes" | "judges" | "hybrid";
export type TournamentAdvancementMethod = "bracket" | "points" | "manual_admin_review";
export type TournamentTieBreaker = "host_review" | "judge_review" | "higher_seed" | "rematch";
export type TournamentThirdPlaceMethod = "none" | "third_place_match" | "score_based";

export type TournamentMedia = {
  url: string | null;
  path: string | null;
  status: "missing" | "uploaded" | "storage_disabled";
};

export type TournamentFoundation = {
  id: string;
  hostId: string;
  title: string;
  shortDescription: string;
  description: string;
  category: string;
  coverMedia: TournamentMedia;
  trailerMedia: TournamentMedia;
  status: TournamentStatus;
  format: TournamentFormat;
  participantCapacity: number;
  participantCount: number;
  privacy: TournamentPrivacy;
  registrationType: TournamentRegistrationType;
  registrationOpensAt: string | null;
  registrationClosesAt: string | null;
  tournamentStartsAt: string | null;
  expectedEndAt: string | null;
  entryType: TournamentEntryType;
  entryFeeAmountMinor: number | null;
  currency: string;
  eligibility: Record<string, unknown>;
  requiresCheckIn: boolean;
  seedingMethod: TournamentSeedingMethod;
  resultMethod: TournamentResultMethod;
  advancementMethod: TournamentAdvancementMethod;
  voting: Record<string, unknown>;
  judging: Record<string, unknown>;
  tieBreaker: TournamentTieBreaker;
  thirdPlaceMethod: TournamentThirdPlaceMethod;
  currentRoundId: string | null;
  currentRoundNumber: number;
  prizePool: Record<string, unknown>;
  sponsorship: Record<string, unknown>;
  dispute: Record<string, unknown>;
  cancellationRefund: Record<string, unknown>;
  hostManagement: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
  publishedAt: string | null;
  completedAt: string | null;
};

export type TournamentParticipantFoundation = { id: string; tournamentId: string; userId: string; status: "registered" | "checked_in" | "active" | "eliminated" | "withdrawn" | "disqualified" | "waitlisted"; seed: number | null; createdAt: string; updatedAt: string };
export type TournamentRoundFoundation = { id: string; tournamentId: string; roundNumber: number; status: "draft" | "scheduled" | "active" | "review" | "completed"; startsAt: string | null; endsAt: string | null };
export type TournamentMatchFoundation = { id: string; tournamentId: string; roundId: string; status: "scheduled" | "active" | "review" | "confirmed"; participantAId: string | null; participantBId: string | null; winnerParticipantId: string | null; resultMethod: TournamentResultMethod };
export type TournamentSubmissionFoundation = { id: string; tournamentId: string; matchId: string | null; userId: string; status: "draft" | "submitted" | "approved" | "rejected"; mediaUrl: string | null; mediaPath: string | null };
export type TournamentVoteFoundation = { id: string; tournamentId: string; matchId: string | null; voterId: string; submissionId: string; voteType: "free" | "paid"; status: "recorded" | "voided" };
export type TournamentJudgeFoundation = { id: string; tournamentId: string; userId: string; status: "invited" | "active" | "removed" };
export type TournamentJudgeScoreFoundation = { id: string; tournamentId: string; judgeId: string; submissionId: string; score: number; status: "draft" | "submitted" };
export type TournamentInvitationFoundation = { id: string; tournamentId: string; inviteeUserId: string | null; emailHash: string | null; status: "pending" | "accepted" | "declined" | "expired" };
export type TournamentWaitlistFoundation = { id: string; tournamentId: string; userId: string; status: "waiting" | "invited" | "removed" };
export type TournamentAnnouncementFoundation = { id: string; tournamentId: string; title: string; body: string; status: "draft" | "published" };
export type TournamentReportFoundation = { id: string; tournamentId: string; reporterId: string; status: "open" | "reviewing" | "resolved" };
export type TournamentDisputeFoundation = { id: string; tournamentId: string; matchId: string | null; status: "open" | "under_review" | "resolved" };
export type TournamentPrizePoolFoundation = { id: string; tournamentId: string; currency: string; confirmedAmountMinor: number; status: "setup_required" | "confirmed" | "admin_review" };
export type TournamentPayoutFoundation = { id: string; tournamentId: string; userId: string; status: "not_started" | "pending_hold" | "kyc_required" | "provider_setup_required" };

export const TOURNAMENT_SUBDOMAIN_COLLECTIONS = [
  "tournamentParticipants",
  "tournamentRounds",
  "tournamentMatches",
  "tournamentSubmissions",
  "tournamentVotes",
  "tournamentJudges",
  "tournamentJudgeScores",
  "tournamentInvitations",
  "tournamentWaitlist",
  "tournamentAnnouncements",
  "tournamentReports",
  "tournamentDisputes",
  "tournamentPrizePools",
  "tournamentPayouts"
] as const;
