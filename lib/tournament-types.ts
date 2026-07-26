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
export type TournamentTieBreaker = "host_review" | "judge_review" | "higher_seed" | "rematch" | "sudden_death_voting" | "predefined_rule";
export type TournamentThirdPlaceMethod = "none" | "third_place_match" | "bronze_match" | "score_based";
export type TournamentParticipantStatus = "registered" | "pending_approval" | "checked_in" | "active" | "eliminated" | "withdrawn" | "disqualified" | "waitlisted" | "rejected";
export type TournamentApplicationStatus = "pending" | "approved" | "rejected" | "changes_requested";
export type TournamentInvitationStatus = "pending" | "accepted" | "declined" | "expired" | "revoked";
export type TournamentCheckInStatus = "not_required" | "pending" | "checked_in" | "missed";
export type TournamentRoundStatus = "draft" | "scheduled" | "active" | "review" | "completed" | "locked";
export type TournamentMatchStatus = "scheduled" | "ready" | "active" | "awaiting_result" | "review" | "confirmed" | "disputed" | "forfeit" | "bye";
export type TournamentSubmissionStatus = "draft" | "uploading" | "processing" | "ready" | "submitted" | "pending_review" | "approved" | "rejected" | "flagged" | "active" | "eliminated" | "winner" | "disqualified" | "withdrawn";
export type TournamentResultStatus = "pending_validation" | "under_review" | "confirmed" | "disputed" | "overridden";
export type TournamentPrizeFundingStatus = "unfunded" | "funding_pending" | "funded" | "locked" | "distribution_pending" | "distributed" | "refunded" | "failed";
export type TournamentSponsorProposalStatus = "pending" | "under_review" | "accepted" | "rejected" | "withdrawn" | "expired";
export type TournamentScoreVisibility = "live" | "hidden" | "final_only";

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
  roundPlan: TournamentRoundPlanItem[];
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
  scoreVisibility: TournamentScoreVisibility;
  prizeDistribution: TournamentPrizeDistribution[];
  readiness: Record<string, unknown>;
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

export type TournamentPrizeDistribution = { placement: 1 | 2 | 3; percent: number };
export type TournamentRoundPlanItem = { roundNumber: number; title: string; brief: string; submissionOpensAt: string | null; submissionDeadlineAt: string | null; votingOpensAt: string | null; votingClosesAt: string | null; acceptedMedia: ("image" | "video")[]; resultMethod: TournamentResultMethod; advancementRule: string };
export type TournamentParticipantFoundation = { id: string; tournamentId: string; userId: string; status: TournamentParticipantStatus; applicationStatus?: TournamentApplicationStatus | null; checkInStatus: TournamentCheckInStatus; seed: number | null; inviteId?: string | null; waitlistPosition?: number | null; createdAt: string; updatedAt: string };
export type TournamentRoundFoundation = { id: string; tournamentId: string; roundNumber: number; title: string; brief: string; status: TournamentRoundStatus; startsAt: string | null; endsAt: string | null; votingOpensAt: string | null; votingClosesAt: string | null };
export type TournamentMatchFoundation = { id: string; tournamentId: string; roundId: string; roundNumber: number; matchNumber: number; status: TournamentMatchStatus; participantAId: string | null; participantBId: string | null; winnerParticipantId: string | null; loserParticipantId: string | null; nextMatchId: string | null; nextSlot: "A" | "B" | null; resultMethod: TournamentResultMethod; resultStatus: TournamentResultStatus | null };
export type TournamentSubmissionFoundation = { id: string; tournamentId: string; roundId: string | null; matchId: string | null; participantId: string; userId: string; status: TournamentSubmissionStatus; mediaUrl: string | null; mediaPath: string | null; mediaType: "image" | "video"; caption?: string; submittedAt?: string | null };
export type TournamentVoteFoundation = { id: string; tournamentId: string; matchId: string | null; voterId: string; submissionId: string; voteType: "free" | "paid"; status: "recorded" | "voided" };
export type TournamentJudgeFoundation = { id: string; tournamentId: string; userId: string; status: "pending" | "accepted" | "declined" | "revoked" | "active" | "removed" };
export type TournamentJudgeScoreFoundation = { id: string; tournamentId: string; judgeId: string; submissionId: string; criteria: Array<{ name: string; weight: number; score: number }>; finalScore: number; status: "draft" | "submitted" };
export type TournamentInvitationFoundation = { id: string; tournamentId: string; inviteeUserId: string | null; emailHash: string | null; status: TournamentInvitationStatus; expiresAt: string | null };
export type TournamentWaitlistFoundation = { id: string; tournamentId: string; userId: string; status: "waiting" | "invited" | "removed" };
export type TournamentAnnouncementFoundation = { id: string; tournamentId: string; title: string; body: string; status: "draft" | "published" };
export type TournamentReportFoundation = { id: string; tournamentId: string; reporterId: string; status: "open" | "reviewing" | "resolved" };
export type TournamentDisputeFoundation = { id: string; tournamentId: string; matchId: string | null; status: "open" | "under_review" | "resolved" };
export type TournamentPrizePoolFoundation = { id: string; tournamentId: string; currency: string; confirmedAmountMinor: number; status: "setup_required" | "confirmed" | "admin_review" };
export type TournamentPayoutFoundation = { id: string; tournamentId: string; userId: string; status: "not_started" | "pending_hold" | "kyc_required" | "provider_setup_required" };
export type TournamentPlacementFoundation = { id: string; tournamentId: string; placement: 1 | 2 | 3; participantId: string; userId: string; sourceMatchId: string; lockedAt: string; payoutStatus: "not_started" | "pending_admin_review" | "pending_hold" | "kyc_required" };
export type TournamentAuditEvent = { id: string; tournamentId: string; actorId: string; action: string; reason?: string; metadata?: Record<string, unknown>; createdAt: string };

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
