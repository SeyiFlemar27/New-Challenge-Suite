import type {
  TournamentFoundation,
  TournamentInvitationStatus,
  TournamentMatchFoundation,
  TournamentParticipantFoundation,
  TournamentParticipantStatus,
  TournamentResultMethod,
  TournamentResultStatus,
  TournamentRoundFoundation,
  TournamentRoundPlanItem,
  TournamentSubmissionStatus
} from "@/lib/tournament-types";
import { buildRoundPlan, singleEliminationMatchCount } from "@/lib/server/tournaments";

export type TournamentActor = { uid: string; role?: string; isAdmin?: boolean; accountType?: string };
export type TournamentOperationResult = { allowed: boolean; code: string; message: string; details?: Record<string, unknown> };

function iso(value = new Date()) {
  return value.toISOString();
}

function isSponsor(actor: TournamentActor) {
  return String(actor.role ?? actor.accountType ?? "").toLowerCase() === "sponsor";
}

function confirmedParticipantCount(participants: TournamentParticipantFoundation[]) {
  return participants.filter((item) => ["registered", "checked_in", "active"].includes(item.status)).length;
}

export function evaluateTournamentJoinEligibility(params: {
  tournament: TournamentFoundation;
  actor: TournamentActor | null;
  participants: TournamentParticipantFoundation[];
  invitation?: { id: string; status: TournamentInvitationStatus; inviteeUserId?: string | null; expiresAt?: string | null } | null;
  profileComplete?: boolean;
  kycApproved?: boolean;
  rulesAccepted?: boolean;
  paymentConfirmed?: boolean;
  now?: Date;
}): TournamentOperationResult & { outcome?: TournamentParticipantStatus } {
  const now = params.now ?? new Date();
  if (!params.actor) return { allowed: false, code: "AUTH_REQUIRED", message: "Sign in before joining this tournament." };
  if (isSponsor(params.actor)) return { allowed: false, code: "SPONSOR_CANNOT_JOIN", message: "Sponsors cannot compete in tournaments." };
  if (params.tournament.hostId === params.actor.uid) return { allowed: false, code: "OWNER_CANNOT_JOIN", message: "Tournament hosts cannot compete in their own tournament." };
  if (params.tournament.entryType !== "free" && !params.paymentConfirmed) return { allowed: false, code: "PAYMENT_CONFIRMATION_REQUIRED", message: "Confirmed tournament entry payment is required." };
  if (params.participants.some((item) => item.userId === params.actor?.uid && item.status !== "withdrawn")) return { allowed: false, code: "DUPLICATE_PARTICIPANT", message: "You already have a tournament registration state." };
  if (params.tournament.status !== "registration_open") return { allowed: false, code: "REGISTRATION_NOT_OPEN", message: "Tournament registration is not open." };
  if (params.tournament.registrationClosesAt && now >= new Date(params.tournament.registrationClosesAt)) return { allowed: false, code: "REGISTRATION_CLOSED", message: "Registration has closed." };
  if (params.tournament.registrationType === "invite_only") {
    if (!params.invitation || params.invitation.status !== "pending" || params.invitation.inviteeUserId !== params.actor.uid) return { allowed: false, code: "INVITATION_REQUIRED", message: "A valid tournament invitation is required." };
    if (params.invitation.expiresAt && now >= new Date(params.invitation.expiresAt)) return { allowed: false, code: "INVITATION_EXPIRED", message: "This tournament invitation has expired." };
  }
  if (params.profileComplete === false) return { allowed: false, code: "PROFILE_REQUIRED", message: "Complete your profile before joining." };
  if (!params.rulesAccepted) return { allowed: false, code: "RULES_REQUIRED", message: "Tournament rules must be accepted." };
  if (confirmedParticipantCount(params.participants) >= params.tournament.participantCapacity) return { allowed: true, outcome: "waitlisted", code: "WAITLIST_AVAILABLE", message: "Tournament is full. Join the waitlist." };
  if (params.tournament.registrationType === "approval_required") return { allowed: true, outcome: "pending_approval", code: "APPLICATION_REQUIRED", message: "Application will be submitted for host review." };
  return { allowed: true, outcome: "registered", code: "REGISTRATION_ALLOWED", message: "Registration can be created." };
}

export function nextWaitlistPosition(waitlist: Array<{ waitlistPosition?: number | null; status?: string }>) {
  const active = waitlist.filter((item) => item.status === "waiting");
  return active.reduce((max, item) => Math.max(max, Number(item.waitlistPosition ?? 0)), 0) + 1;
}

export function participantRecord(params: { id: string; tournamentId: string; userId: string; status: TournamentParticipantStatus; inviteId?: string | null; waitlistPosition?: number | null; now?: string }): TournamentParticipantFoundation {
  const now = params.now ?? iso();
  return { id: params.id, tournamentId: params.tournamentId, userId: params.userId, status: params.status, checkInStatus: "pending", seed: null, inviteId: params.inviteId ?? null, waitlistPosition: params.waitlistPosition ?? null, createdAt: now, updatedAt: now };
}

export function seedParticipants(participants: TournamentParticipantFoundation[], method: "manual" | "random") {
  const eligible = participants.filter((item) => ["registered", "checked_in", "active"].includes(item.status));
  const ordered = method === "random" ? [...eligible].sort((a, b) => a.id.localeCompare(b.id)).map((item, index, list) => list[(index * 7) % list.length]) : eligible;
  return ordered.map((participant, index) => ({ ...participant, seed: index + 1, updatedAt: iso() }));
}

function matchId(tournamentId: string, roundNumber: number, matchNumber: number) {
  return `${tournamentId}_r${roundNumber}_m${matchNumber}`;
}

export function generateSingleEliminationBracket(params: { tournament: TournamentFoundation; participants: TournamentParticipantFoundation[]; existingMatches: TournamentMatchFoundation[]; now?: string }) {
  const eligible = params.participants.filter((item) => ["registered", "checked_in", "active"].includes(item.status)).sort((a, b) => Number(a.seed ?? 9999) - Number(b.seed ?? 9999));
  if (params.existingMatches.length) return { created: false, code: "BRACKET_ALREADY_GENERATED", rounds: [], matches: [] };
  if (eligible.length !== params.tournament.participantCapacity) return { created: false, code: "CAPACITY_NOT_FILLED", rounds: [], matches: [] };
  const plan = params.tournament.roundPlan?.length ? params.tournament.roundPlan : buildRoundPlan(params.tournament.participantCapacity, params.tournament.resultMethod, params.tournament.thirdPlaceMethod);
  const rounds: TournamentRoundFoundation[] = plan.filter((round) => round.title !== "Bronze Match").map((round) => ({
    id: `${params.tournament.id}_round_${round.roundNumber}`,
    tournamentId: params.tournament.id,
    roundNumber: round.roundNumber,
    title: round.title,
    brief: round.brief,
    status: round.roundNumber === 1 ? "scheduled" : "draft",
    startsAt: round.submissionOpensAt,
    endsAt: round.votingClosesAt,
    votingOpensAt: round.votingOpensAt,
    votingClosesAt: round.votingClosesAt
  }));
  const matches: TournamentMatchFoundation[] = [];
  let matchesInRound = params.tournament.participantCapacity / 2;
  for (let roundNumber = 1; roundNumber <= Math.log2(params.tournament.participantCapacity); roundNumber += 1) {
    for (let index = 1; index <= matchesInRound; index += 1) {
      const firstRound = roundNumber === 1;
      const participantA = firstRound ? eligible[index - 1]?.id ?? null : null;
      const participantB = firstRound ? eligible[eligible.length - index]?.id ?? null : null;
      matches.push({
        id: matchId(params.tournament.id, roundNumber, index),
        tournamentId: params.tournament.id,
        roundId: `${params.tournament.id}_round_${roundNumber}`,
        roundNumber,
        matchNumber: index,
        status: firstRound ? "ready" : "scheduled",
        participantAId: participantA,
        participantBId: participantB,
        winnerParticipantId: null,
        loserParticipantId: null,
        nextMatchId: roundNumber < Math.log2(params.tournament.participantCapacity) ? matchId(params.tournament.id, roundNumber + 1, Math.ceil(index / 2)) : null,
        nextSlot: roundNumber < Math.log2(params.tournament.participantCapacity) ? (index % 2 === 1 ? "A" : "B") : null,
        resultMethod: params.tournament.resultMethod,
        resultStatus: null
      });
    }
    matchesInRound /= 2;
  }
  return { created: true, code: "BRACKET_GENERATED", expectedMatchCount: singleEliminationMatchCount(params.tournament.participantCapacity), rounds, matches };
}

export function validateTournamentSubmission(params: { tournament: TournamentFoundation; round: TournamentRoundPlanItem | TournamentRoundFoundation; mediaUrl?: string | null; mediaPath?: string | null; mediaType?: string; now?: Date; replacementAllowed?: boolean; existingStatus?: TournamentSubmissionStatus | null }) {
  const now = params.now ?? new Date();
  const deadline = "submissionDeadlineAt" in params.round ? params.round.submissionDeadlineAt : params.round.endsAt;
  if (deadline && now > new Date(deadline)) return { valid: false, code: "SUBMISSION_DEADLINE_CLOSED", message: "Submission deadline has passed." };
  if (!params.mediaUrl || !params.mediaPath) return { valid: false, code: "UPLOADED_MEDIA_REQUIRED", message: "Tournament submissions require uploaded media URL and storage path." };
  if (!["image", "video"].includes(String(params.mediaType))) return { valid: false, code: "MEDIA_TYPE_UNSUPPORTED", message: "Tournament submissions support image or video media." };
  if (params.existingStatus === "submitted" && !params.replacementAllowed) return { valid: false, code: "REPLACEMENT_NOT_ALLOWED", message: "Submission replacement is not allowed by tournament rules." };
  return { valid: true, code: "SUBMISSION_VALID", message: "Submission can be recorded." };
}

export function validateTournamentVote(params: { tournament: TournamentFoundation; match: TournamentMatchFoundation; existingVote?: boolean; strictOneVote?: boolean; votingOpen?: boolean }) {
  if (!params.votingOpen || params.match.status !== "active") return { valid: false, code: "VOTING_NOT_OPEN", message: "Voting is not open for this match." };
  if (params.existingVote) return { valid: false, code: "DUPLICATE_VOTE_BLOCKED", message: "Duplicate tournament vote rejected." };
  if (params.strictOneVote && (params.tournament.voting as Record<string, unknown>)?.bonusVotesAllowed) return { valid: false, code: "STRICT_VOTING_BLOCKS_BONUS", message: "Strict voting disables bonus, ad, and purchased votes." };
  return { valid: true, code: "VOTE_ALLOWED", message: "Vote can be recorded." };
}

export function validateJudgeRubric(criteria: Array<{ name: string; weight: number }>) {
  const total = criteria.reduce((sum, item) => sum + Number(item.weight ?? 0), 0);
  return { valid: total === 100 && criteria.every((item) => item.name && item.weight >= 0), total, code: total === 100 ? "RUBRIC_VALID" : "RUBRIC_TOTAL_INVALID" };
}

export function calculateHybridScore(params: { audienceScore: number; judgeScore: number; audiencePercent: number; judgePercent: number }) {
  if (params.audiencePercent + params.judgePercent !== 100) return { valid: false, finalScore: 0, sourceValuesStored: true };
  return { valid: true, finalScore: (params.audienceScore * params.audiencePercent + params.judgeScore * params.judgePercent) / 100, sourceValuesStored: true };
}

export function resolveMatchResult(params: { match: TournamentMatchFoundation; winnerParticipantId: string; loserParticipantId: string; fraudFlag?: boolean; moderationIssue?: boolean; unresolvedTie?: boolean; overrideReason?: string; actor?: TournamentActor }) {
  if (params.unresolvedTie) return { confirmed: false, status: "under_review" as TournamentResultStatus, code: "TIE_REQUIRES_CONFIGURED_RESOLUTION" };
  if (params.fraudFlag || params.moderationIssue) return { confirmed: false, status: "under_review" as TournamentResultStatus, code: "MATCH_REQUIRES_REVIEW" };
  if (params.overrideReason && !params.actor?.isAdmin) return { confirmed: false, status: "under_review" as TournamentResultStatus, code: "OVERRIDE_REQUIRES_ADMIN" };
  return { confirmed: true, status: params.overrideReason ? "overridden" as TournamentResultStatus : "confirmed" as TournamentResultStatus, code: "MATCH_RESULT_CONFIRMED", auditRequired: Boolean(params.overrideReason) };
}

export function advanceWinner(params: { match: TournamentMatchFoundation; existingNextMatch?: TournamentMatchFoundation | null }) {
  if (!params.match.winnerParticipantId) return { advanced: false, code: "WINNER_REQUIRED" };
  if (!params.match.nextMatchId) return { advanced: true, code: "FINAL_PLACEMENT_READY", nextMatch: null };
  if (!params.existingNextMatch) return { advanced: false, code: "NEXT_MATCH_MISSING" };
  const nextMatch = { ...params.existingNextMatch };
  if (params.match.nextSlot === "A") {
    if (nextMatch.participantAId === params.match.winnerParticipantId) return { advanced: false, code: "ADVANCEMENT_ALREADY_APPLIED", nextMatch };
    nextMatch.participantAId = params.match.winnerParticipantId;
  }
  if (params.match.nextSlot === "B") {
    if (nextMatch.participantBId === params.match.winnerParticipantId) return { advanced: false, code: "ADVANCEMENT_ALREADY_APPLIED", nextMatch };
    nextMatch.participantBId = params.match.winnerParticipantId;
  }
  nextMatch.status = nextMatch.participantAId && nextMatch.participantBId ? "ready" : nextMatch.status;
  return { advanced: true, code: "WINNER_ADVANCED", nextMatch };
}

export function finalPlacements(params: { finalMatch: TournamentMatchFoundation; bronzeMatch?: TournamentMatchFoundation | null }) {
  if (!params.finalMatch.winnerParticipantId || !params.finalMatch.loserParticipantId) return [];
  const placements: Array<{ placement: 1 | 2 | 3; participantId: string; sourceMatchId: string }> = [
    { placement: 1 as const, participantId: params.finalMatch.winnerParticipantId, sourceMatchId: params.finalMatch.id },
    { placement: 2 as const, participantId: params.finalMatch.loserParticipantId, sourceMatchId: params.finalMatch.id }
  ];
  if (params.bronzeMatch?.winnerParticipantId) placements.push({ placement: 3 as const, participantId: params.bronzeMatch.winnerParticipantId, sourceMatchId: params.bronzeMatch.id });
  return placements;
}

export function tournamentSponsorPrizeState(params: { sponsorProposalsAccepted?: boolean; sponsorPaymentConfirmed?: boolean; confirmedPrizeMinor?: number; sponsorBrandingApproved?: boolean }) {
  const funded = Boolean(params.sponsorPaymentConfirmed && Number(params.confirmedPrizeMinor ?? 0) > 0);
  return {
    proposalStatus: params.sponsorProposalsAccepted ? "accepted_requires_payment_confirmation" : "pending",
    prizeFundingStatus: funded ? "funded" : params.sponsorProposalsAccepted ? "funding_pending" : "unfunded",
    publicSponsorDisplayAllowed: Boolean(funded && params.sponsorBrandingApproved),
    sponsorFundsGoToWinnersPercent: 100,
    payoutProviderCalled: false
  };
}

export function auditEvent(params: { id: string; tournamentId: string; actorId: string; action: string; reason?: string; metadata?: Record<string, unknown>; now?: string }) {
  return { id: params.id, tournamentId: params.tournamentId, actorId: params.actorId, action: params.action, reason: params.reason, metadata: params.metadata ?? {}, createdAt: params.now ?? iso() };
}

export const TOURNAMENT_MANAGEMENT_ROLES = ["host", "manager", "participant_manager", "submission_reviewer", "moderator", "judge_coordinator", "finance_viewer"] as const;

export function adminTournamentActionFoundation(action: string) {
  const sensitive = ["approve", "reject", "pause", "resume", "cancel", "lock_voting", "reopen_review", "resolve_dispute", "disqualify", "confirm_result", "approve_payout_foundation", "trigger_refund_foundation"];
  return { action, adminRequired: sensitive.includes(action), auditRequired: sensitive.includes(action), payoutProviderCalled: false, rawVoteTotalEditable: false, balanceOverwriteAllowed: false };
}
