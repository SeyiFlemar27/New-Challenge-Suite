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
import { randomInt } from "node:crypto";
import { bracketSizeForParticipants, buildRoundPlan, doubleEliminationMatchCount, singleEliminationMatchCount } from "@/lib/server/tournaments";

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
  const ordered = [...eligible];
  if (method === "random") {
    for (let index = ordered.length - 1; index > 0; index -= 1) {
      const swapIndex = randomInt(index + 1);
      [ordered[index], ordered[swapIndex]] = [ordered[swapIndex], ordered[index]];
    }
  }
  return ordered.map((participant, index) => ({ ...participant, seed: index + 1, updatedAt: iso() }));
}

function matchId(tournamentId: string, roundNumber: number, matchNumber: number) {
  return `${tournamentId}_r${roundNumber}_m${matchNumber}`;
}

export function generateSingleEliminationBracket(params: { tournament: TournamentFoundation; participants: TournamentParticipantFoundation[]; existingMatches: TournamentMatchFoundation[]; now?: string }) {
  const eligible = params.participants.filter((item) => ["registered", "checked_in", "active"].includes(item.status)).sort((a, b) => Number(a.seed ?? 9999) - Number(b.seed ?? 9999));
  if (params.existingMatches.length) return { created: false, code: "BRACKET_ALREADY_GENERATED", rounds: [], matches: [] };
  if (eligible.length < 2 || eligible.length > params.tournament.participantCapacity) return { created: false, code: "PARTICIPANT_COUNT_INVALID", rounds: [], matches: [] };
  const bracketSize = bracketSizeForParticipants(eligible.length);
  const plan = buildRoundPlan(bracketSize, params.tournament.resultMethod, params.tournament.thirdPlaceMethod);
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
  let matchesInRound = bracketSize / 2;
  const slots = [...eligible.map((item) => item.id), ...Array<string | null>(bracketSize - eligible.length).fill(null)];
  for (let roundNumber = 1; roundNumber <= Math.log2(bracketSize); roundNumber += 1) {
    for (let index = 1; index <= matchesInRound; index += 1) {
      const firstRound = roundNumber === 1;
      const participantA = firstRound ? slots[index - 1] ?? null : null;
      const participantB = firstRound ? slots[bracketSize - index] ?? null : null;
      const byeWinner = firstRound && Boolean(participantA || participantB) && !(participantA && participantB) ? participantA || participantB : null;
      matches.push({
        id: matchId(params.tournament.id, roundNumber, index),
        tournamentId: params.tournament.id,
        roundId: `${params.tournament.id}_round_${roundNumber}`,
        roundNumber,
        matchNumber: index,
        bracket: "winners",
        status: byeWinner ? "bye" : firstRound ? "ready" : "scheduled",
        participantAId: participantA,
        participantBId: participantB,
        winnerParticipantId: byeWinner,
        loserParticipantId: null,
        nextMatchId: roundNumber < Math.log2(bracketSize) ? matchId(params.tournament.id, roundNumber + 1, Math.ceil(index / 2)) : null,
        nextSlot: roundNumber < Math.log2(bracketSize) ? (index % 2 === 1 ? "A" : "B") : null,
        resultMethod: params.tournament.resultMethod,
        resultStatus: null
      });
    }
    matchesInRound /= 2;
  }
  for (const match of matches.filter((item) => item.status === "bye" && item.nextMatchId)) {
    const next = matches.find((item) => item.id === match.nextMatchId);
    if (!next || !match.winnerParticipantId) continue;
    if (match.nextSlot === "A") next.participantAId = match.winnerParticipantId;
    if (match.nextSlot === "B") next.participantBId = match.winnerParticipantId;
    if (next.participantAId && next.participantBId) next.status = "ready";
  }
  return { created: true, code: "BRACKET_GENERATED", expectedMatchCount: singleEliminationMatchCount(eligible.length), rounds, matches };
}

export function generateDoubleEliminationBracket(params: { tournament: TournamentFoundation; participants: TournamentParticipantFoundation[]; existingMatches: TournamentMatchFoundation[] }) {
  const single = generateSingleEliminationBracket(params);
  if (!single.created) return single;
  const winners = single.matches.map((match) => ({ ...match, id: match.id.replace("_r", "_wb_r"), roundId: match.roundId.replace("_round_", "_wb_round_"), bracket: "winners" as const }));
  const winnersByOriginalId = new Map(single.matches.map((match, index) => [match.id, winners[index].id]));
  winners.forEach((match, index) => {
    const source = single.matches[index];
    match.nextMatchId = source.nextMatchId ? winnersByOriginalId.get(source.nextMatchId) ?? null : null;
  });
  const winnerRounds = Math.ceil(Math.log2(bracketSizeForParticipants(params.participants.filter((item) => ["registered", "checked_in", "active"].includes(item.status)).length)));
  const losers: TournamentMatchFoundation[] = [];
  for (let loserRound = 1; loserRound <= Math.max(1, 2 * (winnerRounds - 1)); loserRound += 1) {
    const pairRound = Math.ceil(loserRound / 2);
    const count = Math.max(1, 2 ** Math.max(0, winnerRounds - pairRound - 1));
    for (let index = 1; index <= count; index += 1) {
      const nextCount = Math.max(1, Math.ceil(count / 2));
      const nextRound = loserRound + 1;
      const hasNext = loserRound < 2 * (winnerRounds - 1);
      losers.push({ id: `${params.tournament.id}_lb_r${loserRound}_m${index}`, tournamentId: params.tournament.id, roundId: `${params.tournament.id}_lb_round_${loserRound}`, roundNumber: winnerRounds + loserRound, matchNumber: index, bracket: "losers", status: "scheduled", participantAId: null, participantBId: null, winnerParticipantId: null, loserParticipantId: null, nextMatchId: hasNext ? `${params.tournament.id}_lb_r${nextRound}_m${Math.min(nextCount, loserRound % 2 === 1 ? index : Math.ceil(index / 2))}` : `${params.tournament.id}_grand_final`, nextSlot: hasNext ? (loserRound % 2 === 1 ? "A" : index % 2 === 1 ? "A" : "B") : "B", resultMethod: params.tournament.resultMethod, resultStatus: null });
    }
  }
  winners.forEach((match) => {
    const sourceRound = match.roundNumber;
    const targetRound = sourceRound === 1 ? 1 : 2 * (sourceRound - 1);
    match.loserNextMatchId = `${params.tournament.id}_lb_r${targetRound}_m${sourceRound === 1 ? Math.ceil(match.matchNumber / 2) : match.matchNumber}`;
    match.loserNextSlot = sourceRound === 1 ? (match.matchNumber % 2 === 1 ? "A" : "B") : "B";
  });
  const winnerFinal = winners.find((item) => !item.nextMatchId);
  if (winnerFinal) { winnerFinal.nextMatchId = `${params.tournament.id}_grand_final`; winnerFinal.nextSlot = "A"; }
  const grandFinalResetId = `${params.tournament.id}_grand_final_reset`;
  const grandFinal: TournamentMatchFoundation = { id: `${params.tournament.id}_grand_final`, tournamentId: params.tournament.id, roundId: `${params.tournament.id}_grand_final_round`, roundNumber: winnerRounds * 3, matchNumber: 1, bracket: "grand_final", status: "scheduled", participantAId: null, participantBId: null, winnerParticipantId: null, loserParticipantId: null, nextMatchId: null, nextSlot: null, resetMatchId: grandFinalResetId, resultMethod: params.tournament.resultMethod, resultStatus: null };
  const grandFinalReset: TournamentMatchFoundation = { id: grandFinalResetId, tournamentId: params.tournament.id, roundId: `${params.tournament.id}_grand_final_reset_round`, roundNumber: winnerRounds * 3 + 1, matchNumber: 1, bracket: "grand_final", status: "scheduled", participantAId: null, participantBId: null, winnerParticipantId: null, loserParticipantId: null, nextMatchId: null, nextSlot: null, resetMatchId: null, resultMethod: params.tournament.resultMethod, resultStatus: null };
  const rounds = [
    ...single.rounds.map((round) => ({ ...round, id: round.id.replace("_round_", "_wb_round_"), title: `Winners ${round.title}` })),
    ...Array.from({ length: Math.max(1, 2 * (winnerRounds - 1)) }, (_, index) => ({ id: `${params.tournament.id}_lb_round_${index + 1}`, tournamentId: params.tournament.id, roundNumber: winnerRounds + index + 1, title: `Losers Round ${index + 1}`, brief: "A second loss eliminates a participant.", status: "draft" as const, startsAt: null, endsAt: null, votingOpensAt: null, votingClosesAt: null })),
    { id: `${params.tournament.id}_grand_final_round`, tournamentId: params.tournament.id, roundNumber: winnerRounds * 3, title: "Grand Final", brief: "Winners bracket finalist faces the losers bracket finalist.", status: "draft" as const, startsAt: null, endsAt: null, votingOpensAt: null, votingClosesAt: null },
    { id: `${params.tournament.id}_grand_final_reset_round`, tournamentId: params.tournament.id, roundNumber: winnerRounds * 3 + 1, title: "Grand Final Reset", brief: "Played only if the undefeated finalist receives a first loss in the Grand Final.", status: "draft" as const, startsAt: null, endsAt: null, votingOpensAt: null, votingClosesAt: null }
  ];
  return { created: true, code: "DOUBLE_ELIMINATION_BRACKET_GENERATED", expectedMatchCount: doubleEliminationMatchCount(params.participants.filter((item) => ["registered", "checked_in", "active"].includes(item.status)).length), rounds, matches: [...winners, ...losers, grandFinal, grandFinalReset] };
}

export function generateTournamentBracket(params: { tournament: TournamentFoundation; participants: TournamentParticipantFoundation[]; existingMatches: TournamentMatchFoundation[] }) {
  return params.tournament.format === "double_elimination" ? generateDoubleEliminationBracket(params) : generateSingleEliminationBracket(params);
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
