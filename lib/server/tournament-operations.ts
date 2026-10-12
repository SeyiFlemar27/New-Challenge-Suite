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
import { createHash, randomInt } from "node:crypto";
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
  if (params.tournament.participationMode === "team") return { allowed: false, code: "TEAM_REGISTRATION_REQUIRED", message: "Create or join a tournament team to enter this tournament." };
  if (isSponsor(params.actor)) return { allowed: false, code: "SPONSOR_CANNOT_JOIN", message: "Sponsors cannot compete in tournaments." };
  if (params.tournament.hostId === params.actor.uid) return { allowed: false, code: "OWNER_CANNOT_JOIN", message: "Tournament hosts cannot compete in their own tournament." };
  if (params.tournament.entryType !== "free" && !params.paymentConfirmed) return { allowed: false, code: "PAYMENT_CONFIRMATION_REQUIRED", message: "Confirmed tournament entry payment is required." };
  if (params.participants.some((item) => item.userId === params.actor?.uid && item.status !== "withdrawn")) return { allowed: false, code: "DUPLICATE_PARTICIPANT", message: "You already have a tournament registration state." };
  if (params.tournament.status !== "registration_open") return { allowed: false, code: "REGISTRATION_NOT_OPEN", message: "Tournament registration is not open." };
  if (Number(params.tournament.configVersion ?? 1) < 3 && params.tournament.registrationClosesAt && now >= new Date(params.tournament.registrationClosesAt)) return { allowed: false, code: "REGISTRATION_CLOSED", message: "Registration has closed." };
  if (params.tournament.registrationType === "invite_only") {
    if (!params.invitation || params.invitation.status !== "pending" || params.invitation.inviteeUserId !== params.actor.uid) return { allowed: false, code: "INVITATION_REQUIRED", message: "A valid tournament invitation is required." };
    if (params.invitation.expiresAt && now >= new Date(params.invitation.expiresAt)) return { allowed: false, code: "INVITATION_EXPIRED", message: "This tournament invitation has expired." };
  }
  if (params.profileComplete === false) return { allowed: false, code: "PROFILE_REQUIRED", message: "Complete your profile before joining." };
  if (!params.rulesAccepted) return { allowed: false, code: "RULES_REQUIRED", message: "Tournament rules must be accepted." };
  if (Number(params.tournament.configVersion ?? 1) >= 3 && Number(params.tournament.participantCount ?? 0) >= params.tournament.participantCapacity) return { allowed: false, code: "TOURNAMENT_CAPACITY_REACHED", message: "Every Tournament bracket slot is full." };
  if (Number(params.tournament.configVersion ?? 1) < 3 && confirmedParticipantCount(params.participants) >= params.tournament.participantCapacity) return { allowed: true, outcome: "waitlisted", code: "WAITLIST_AVAILABLE", message: "Tournament is full. Join the waitlist." };
  if (params.tournament.registrationType === "approval_required" && Number(params.tournament.configVersion ?? 1) < 2) return { allowed: true, outcome: "pending_approval", code: "APPLICATION_REQUIRED", message: "Legacy tournament application will be submitted for host review." };
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

export function seedParticipants(participants: TournamentParticipantFoundation[], method: "manual" | "random" | "ranking", tournamentId = "legacy") {
  const eligible = participants.filter((item) => ["registered", "checked_in", "active"].includes(item.status));
  const ordered = [...eligible];
  if (method === "ranking") {
    ordered.sort((a, b) => Number(b.rankingScore ?? b.cumulativeScore ?? -1) - Number(a.rankingScore ?? a.cumulativeScore ?? -1) || createHash("sha256").update(`${tournamentId}:${a.id}`).digest("hex").localeCompare(createHash("sha256").update(`${tournamentId}:${b.id}`).digest("hex")));
  } else if (method === "random") {
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
  const configVersion = Number(params.tournament.configVersion ?? 1);
  if (configVersion >= 3 && eligible.length !== params.tournament.participantCapacity) return { created: false, code: "BRACKET_REQUIRES_FULL_CAPACITY", rounds: [], matches: [] };
  if (eligible.length < 2 || eligible.length > params.tournament.participantCapacity) return { created: false, code: "PARTICIPANT_COUNT_INVALID", rounds: [], matches: [] };
  const bracketSize = configVersion >= 3 ? params.tournament.participantCapacity : bracketSizeForParticipants(eligible.length);
  const plan = buildRoundPlan(bracketSize, params.tournament.resultMethod, params.tournament.thirdPlaceMethod);
  const rounds: TournamentRoundFoundation[] = plan.map((round) => ({
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
      const byeWinner = configVersion < 3 && firstRound && Boolean(participantA || participantB) && !(participantA && participantB) ? participantA || participantB : null;
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
        resultStatus: null,
        ...(configVersion >= 3 ? { tiePrioritySlot: randomInt(2) === 0 ? "A" as const : "B" as const } : {})
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
  const bronzeRound = plan.find((round) => round.title === "Bronze Match");
  if (bronzeRound && bracketSize >= 4) {
    const bronzeMatchId = `${params.tournament.id}_bronze_match`;
    const semifinalRound = Math.log2(bracketSize) - 1;
    for (const semifinal of matches.filter((item) => item.roundNumber === semifinalRound)) {
      semifinal.loserNextMatchId = bronzeMatchId;
      semifinal.loserNextSlot = semifinal.matchNumber % 2 === 1 ? "A" : "B";
    }
    matches.push({
      id: bronzeMatchId,
      tournamentId: params.tournament.id,
      roundId: `${params.tournament.id}_round_${bronzeRound.roundNumber}`,
      roundNumber: bronzeRound.roundNumber,
      matchNumber: 1,
      bracket: "bronze",
      status: "scheduled",
      participantAId: null,
      participantBId: null,
      winnerParticipantId: null,
      loserParticipantId: null,
      nextMatchId: null,
      nextSlot: null,
      resultMethod: params.tournament.resultMethod,
      resultStatus: null,
      ...(configVersion >= 3 ? { tiePrioritySlot: randomInt(2) === 0 ? "A" as const : "B" as const } : {})
    });
  }
  return { created: true, code: "BRACKET_GENERATED", expectedMatchCount: singleEliminationMatchCount(eligible.length, Boolean(bronzeRound)), rounds, matches };
}

export function generateDoubleEliminationBracket(params: { tournament: TournamentFoundation; participants: TournamentParticipantFoundation[]; existingMatches: TournamentMatchFoundation[] }) {
  const single = generateSingleEliminationBracket({ ...params, tournament: { ...params.tournament, thirdPlaceMethod: "none" } });
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
      losers.push({ id: `${params.tournament.id}_lb_r${loserRound}_m${index}`, tournamentId: params.tournament.id, roundId: `${params.tournament.id}_lb_round_${loserRound}`, roundNumber: winnerRounds + loserRound, matchNumber: index, bracket: "losers", status: "scheduled", participantAId: null, participantBId: null, winnerParticipantId: null, loserParticipantId: null, nextMatchId: hasNext ? `${params.tournament.id}_lb_r${nextRound}_m${Math.min(nextCount, loserRound % 2 === 1 ? index : Math.ceil(index / 2))}` : `${params.tournament.id}_grand_final`, nextSlot: hasNext ? (loserRound % 2 === 1 ? "A" : index % 2 === 1 ? "A" : "B") : "B", resultMethod: params.tournament.resultMethod, resultStatus: null, ...(Number(params.tournament.configVersion ?? 1) >= 3 ? { tiePrioritySlot: randomInt(2) === 0 ? "A" as const : "B" as const } : {}) });
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
  const grandFinal: TournamentMatchFoundation = { id: `${params.tournament.id}_grand_final`, tournamentId: params.tournament.id, roundId: `${params.tournament.id}_grand_final_round`, roundNumber: winnerRounds * 3, matchNumber: 1, bracket: "grand_final", status: "scheduled", participantAId: null, participantBId: null, winnerParticipantId: null, loserParticipantId: null, nextMatchId: null, nextSlot: null, resetMatchId: grandFinalResetId, resultMethod: params.tournament.resultMethod, resultStatus: null, ...(Number(params.tournament.configVersion ?? 1) >= 3 ? { tiePrioritySlot: randomInt(2) === 0 ? "A" as const : "B" as const } : {}) };
  const grandFinalReset: TournamentMatchFoundation = { id: grandFinalResetId, tournamentId: params.tournament.id, roundId: `${params.tournament.id}_grand_final_reset_round`, roundNumber: winnerRounds * 3 + 1, matchNumber: 1, bracket: "grand_final", status: "scheduled", participantAId: null, participantBId: null, winnerParticipantId: null, loserParticipantId: null, nextMatchId: null, nextSlot: null, resetMatchId: null, resultMethod: params.tournament.resultMethod, resultStatus: null, ...(Number(params.tournament.configVersion ?? 1) >= 3 ? { tiePrioritySlot: randomInt(2) === 0 ? "A" as const : "B" as const } : {}) };
  const rounds = [
    ...single.rounds.map((round) => ({ ...round, id: round.id.replace("_round_", "_wb_round_"), title: `Winners ${round.title}` })),
    ...Array.from({ length: Math.max(1, 2 * (winnerRounds - 1)) }, (_, index) => ({ id: `${params.tournament.id}_lb_round_${index + 1}`, tournamentId: params.tournament.id, roundNumber: winnerRounds + index + 1, title: `Losers Round ${index + 1}`, brief: "A second loss eliminates a participant.", status: "draft" as const, startsAt: null, endsAt: null, votingOpensAt: null, votingClosesAt: null })),
    { id: `${params.tournament.id}_grand_final_round`, tournamentId: params.tournament.id, roundNumber: winnerRounds * 3, title: "Grand Final", brief: "Winners bracket finalist faces the losers bracket finalist.", status: "draft" as const, startsAt: null, endsAt: null, votingOpensAt: null, votingClosesAt: null },
    { id: `${params.tournament.id}_grand_final_reset_round`, tournamentId: params.tournament.id, roundNumber: winnerRounds * 3 + 1, title: "Grand Final Reset", brief: "Played only if the undefeated finalist receives a first loss in the Grand Final.", status: "draft" as const, startsAt: null, endsAt: null, votingOpensAt: null, votingClosesAt: null }
  ];
  return { created: true, code: "DOUBLE_ELIMINATION_BRACKET_GENERATED", expectedMatchCount: doubleEliminationMatchCount(bracketSizeForParticipants(params.participants.filter((item) => ["registered", "checked_in", "active"].includes(item.status)).length)), rounds, matches: [...winners, ...losers, grandFinal, grandFinalReset] };
}

export function generateTournamentBracket(params: { tournament: TournamentFoundation; participants: TournamentParticipantFoundation[]; existingMatches: TournamentMatchFoundation[] }) {
  return params.tournament.format === "double_elimination" ? generateDoubleEliminationBracket(params) : generateSingleEliminationBracket(params);
}

export function validateTournamentSubmission(params: { tournament: TournamentFoundation; round: TournamentRoundPlanItem | TournamentRoundFoundation; mediaUrl?: string | null; mediaPath?: string | null; mediaType?: string; now?: Date; replacementAllowed?: boolean; existingStatus?: TournamentSubmissionStatus | null }) {
  const now = params.now ?? new Date();
  const deadline = "submissionDeadlineAt" in params.round ? params.round.submissionDeadlineAt : params.round.endsAt;
  const opensAt = "submissionOpensAt" in params.round ? params.round.submissionOpensAt : params.round.startsAt;
  if (opensAt && now < new Date(opensAt)) return { valid: false, code: "SUBMISSION_NOT_OPEN", message: "Round submissions are not open yet." };
  if (deadline && now >= new Date(deadline)) return { valid: false, code: "SUBMISSION_DEADLINE_CLOSED", message: "Submission deadline has passed." };
  if (!params.mediaUrl || !params.mediaPath) return { valid: false, code: "UPLOADED_MEDIA_REQUIRED", message: "Tournament submissions require uploaded media URL and storage path." };
  if (!["image", "video"].includes(String(params.mediaType))) return { valid: false, code: "MEDIA_TYPE_UNSUPPORTED", message: "Tournament submissions support image or video media." };
  if (params.existingStatus === "submitted" && !params.replacementAllowed) return { valid: false, code: "REPLACEMENT_NOT_ALLOWED", message: "Submission replacement is not allowed by tournament rules." };
  if (params.existingStatus && params.existingStatus !== "submitted") return { valid: false, code: "SUBMISSION_ALREADY_RECORDED", message: "An official submission has already been recorded for this match." };
  return { valid: true, code: "SUBMISSION_VALID", message: "Submission can be recorded." };
}

export function validateTournamentVote(params: {
  tournament: TournamentFoundation;
  match: TournamentMatchFoundation;
  round: TournamentRoundFoundation;
  now?: Date;
}) {
  const now = params.now ?? new Date();
  const voting = (params.tournament.voting ?? {}) as Record<string, unknown>;
  if (params.tournament.status !== "active" && params.tournament.status !== "round_active") return { valid: false, code: "TOURNAMENT_NOT_VOTING", message: "This tournament is not accepting votes." };
  if (params.tournament.resultMethod !== "votes" || params.match.resultMethod !== "votes") return { valid: false, code: "PUBLIC_VOTING_DISABLED", message: "Public voting is not the configured decision method for this match." };
  const versionThree = Number(params.tournament.configVersion ?? 1) >= 3;
  if (params.match.resultStatus === "confirmed" || (versionThree
    ? params.match.status !== "voting_open"
    : params.match.status !== "active" || params.round.status !== "active")) return { valid: false, code: "MATCH_NOT_VOTING", message: "This match is not accepting votes." };
  if (!params.match.participantAId || !params.match.participantBId || params.match.participantAId === params.match.participantBId) return { valid: false, code: "MATCH_COMPETITORS_INVALID", message: "Both eligible competitors must be assigned before voting opens." };
  if (params.round.tournamentId !== params.tournament.id || params.match.tournamentId !== params.tournament.id || params.match.roundId !== params.round.id || params.round.roundNumber !== params.match.roundNumber) return { valid: false, code: "MATCH_ROUND_MISMATCH", message: "The match and round do not belong to this tournament round." };
  const opensAt = Date.parse(String(versionThree ? params.match.votingOpenedAt ?? "" : params.round.votingOpensAt ?? ""));
  const closesAt = Date.parse(String(versionThree ? params.match.votingClosesAt ?? "" : params.round.votingClosesAt ?? ""));
  if (!Number.isFinite(opensAt) || !Number.isFinite(closesAt) || now.getTime() < opensAt || now.getTime() >= closesAt) return { valid: false, code: "VOTING_WINDOW_CLOSED", message: "Voting is not open for this match." };
  if (voting.paidVotesActive === true && Number(params.tournament.configVersion ?? 1) < 3) return { valid: false, code: "PAID_TOURNAMENT_VOTING_UNSUPPORTED", message: "Paid voting is unavailable for this legacy Tournament." };
  return { valid: true, code: "VOTE_ALLOWED", message: "The configured eligible Tournament vote can be recorded." };
}

export function isTournamentCompetitorVoter(params: { userId: string; participationMode: unknown; competitor: Record<string, unknown>; membership?: Record<string, unknown> | null; teamId: string }) {
  if (params.participationMode === "team") {
    const members = Array.isArray(params.competitor.memberUserIds) ? params.competitor.memberUserIds : [];
    return members.includes(params.userId)
      || (params.membership?.status === "active" && params.membership.teamId === params.teamId);
  }
  return params.competitor.userId === params.userId;
}

export function tournamentMatchVoteOutcome(match: TournamentMatchFoundation) {
  const votesA = Number.isSafeInteger(match.voteCountA) && Number(match.voteCountA) >= 0 ? Number(match.voteCountA) : 0;
  const votesB = Number.isSafeInteger(match.voteCountB) && Number(match.voteCountB) >= 0 ? Number(match.voteCountB) : 0;
  return {
    votesA,
    votesB,
    winnerParticipantId: votesA === votesB ? null : votesA > votesB ? match.participantAId : match.participantBId,
    tied: votesA === votesB,
    totalVotes: votesA + votesB
  };
}

export function resolveTournamentVoteEventSequence(params: {
  match: TournamentMatchFoundation;
  votes: Array<Record<string, unknown>>;
  maximumEvents?: number;
}) {
  const { match, votes } = params;
  const maximumEvents = params.maximumEvents ?? 5000;
  if (votes.length > maximumEvents) return { valid: false, code: "VOTE_EVENT_LIMIT_EXCEEDED", votesA: 0, votesB: 0, winnerParticipantId: null, tied: false, totalVotes: votes.length, resolution: "held" as const };
  const ordered = [...votes].sort((a, b) => Number(a.voteSequence) - Number(b.voteSequence));
  const seen = new Set<number>();
  let votesA = 0;
  let votesB = 0;
  const sequencesA: number[] = [];
  const sequencesB: number[] = [];
  for (const [index, event] of ordered.entries()) {
    const sequence = Number(event.voteSequence);
    const participantId = String(event.selectedParticipantId ?? event.participantId ?? "");
    if (!Number.isSafeInteger(sequence) || sequence !== index + 1 || seen.has(sequence) || ![match.participantAId, match.participantBId].includes(participantId) || event.status !== "recorded") {
      return { valid: false, code: "VOTE_EVENT_INTEGRITY_FAILED", votesA, votesB, winnerParticipantId: null, tied: false, totalVotes: ordered.length, resolution: "held" as const };
    }
    seen.add(sequence);
    if (participantId === match.participantAId) { votesA += 1; sequencesA.push(sequence); }
    else { votesB += 1; sequencesB.push(sequence); }
  }
  if (ordered.length !== Number(match.voteSequence ?? 0) || seen.size !== Number(match.voteSequence ?? 0)) {
    return { valid: false, code: "VOTE_EVENT_SEQUENCE_MISMATCH", votesA, votesB, winnerParticipantId: null, tied: votesA === votesB, totalVotes: ordered.length, resolution: "held" as const };
  }
  if (votesA !== Number(match.voteCountA ?? 0) || votesB !== Number(match.voteCountB ?? 0)) {
    return { valid: false, code: "VOTE_TALLY_MISMATCH", votesA, votesB, winnerParticipantId: null, tied: votesA === votesB, totalVotes: ordered.length, resolution: "held" as const };
  }
  if (votesA !== votesB) return { valid: true, code: "VOTE_SEQUENCE_WINNER", votesA, votesB, winnerParticipantId: votesA > votesB ? match.participantAId : match.participantBId, tied: false, totalVotes: ordered.length, resolution: "vote_total" as const };
  if (votesA > 0) {
    const sequenceA = sequencesA[votesA - 1];
    const sequenceB = sequencesB[votesB - 1];
    if (sequenceA !== sequenceB) return { valid: true, code: "TIE_RESOLVED_BY_FINAL_TALLY_SEQUENCE", votesA, votesB, winnerParticipantId: sequenceA < sequenceB ? match.participantAId : match.participantBId, tied: true, totalVotes: ordered.length, resolution: "final_tally_sequence" as const };
  }
  const priority = match.tiePrioritySlot === "A" ? match.participantAId : match.tiePrioritySlot === "B" ? match.participantBId : null;
  if (!priority) return { valid: false, code: "TIE_PRIORITY_MISSING", votesA, votesB, winnerParticipantId: null, tied: true, totalVotes: ordered.length, resolution: "held" as const };
  return { valid: true, code: "TIE_RESOLVED_BY_PRE_RECORDED_PRIORITY", votesA, votesB, winnerParticipantId: priority, tied: true, totalVotes: ordered.length, resolution: "pre_recorded_priority" as const };
}

export function validateJudgeRubric(criteria: Array<{ name: string; weight: number }>) {
  const total = criteria.reduce((sum, item) => sum + Number(item.weight ?? 0), 0);
  return { valid: total === 100 && criteria.every((item) => item.name && item.weight >= 0), total, code: total === 100 ? "RUBRIC_VALID" : "RUBRIC_TOTAL_INVALID" };
}

export function calculateHybridScore(params: { audienceScore: number; judgeScore: number; audiencePercent: number; judgePercent: number }) {
  if (params.audiencePercent + params.judgePercent !== 100) return { valid: false, finalScore: 0, sourceValuesStored: true };
  return { valid: true, finalScore: (params.audienceScore * params.audiencePercent + params.judgeScore * params.judgePercent) / 100, sourceValuesStored: true };
}

export function cumulativeTournamentScore(current: number | null | undefined, matchScore: number) {
  const previous = Number(current ?? 0);
  const next = Number(matchScore);
  if (!Number.isFinite(previous) || !Number.isFinite(next) || next < 0) return { valid: false, score: previous };
  return { valid: true, score: Math.round((previous + next) * 10000) / 10000 };
}

export function splitTeamPrizeEqually(params: { amountMinor: number; lockedRosterUserIds: string[]; payoutEligibleUserIds?: string[] }) {
  const amountMinor = Math.trunc(params.amountMinor);
  const roster = [...new Set(params.lockedRosterUserIds.filter(Boolean))].sort();
  if (!Number.isSafeInteger(amountMinor) || amountMinor < 0 || !roster.length) return { valid: false, allocations: [], allocatedMinor: 0 };
  const eligible = params.payoutEligibleUserIds ? new Set(params.payoutEligibleUserIds) : null;
  const base = Math.floor(amountMinor / roster.length);
  const remainder = amountMinor % roster.length;
  const allocations = roster.map((userId, index) => {
    const amount = base + (index < remainder ? 1 : 0);
    return { userId, amountMinor: amount, status: eligible && !eligible.has(userId) ? "pending_hold" as const : "pending_admin_review" as const };
  });
  return { valid: true, allocations, allocatedMinor: allocations.reduce((sum, item) => sum + item.amountMinor, 0) };
}

export function resolveTournamentNoSubmission(params: { participantASubmitted: boolean; participantBSubmitted: boolean; extensionAlreadyUsed: boolean }) {
  if (params.participantASubmitted !== params.participantBSubmitted) return { action: "forfeit" as const, winnerSlot: params.participantASubmitted ? "A" as const : "B" as const, extensionHours: 0 };
  if (!params.participantASubmitted && !params.extensionAlreadyUsed) return { action: "extend" as const, winnerSlot: null, extensionHours: 12 };
  if (!params.participantASubmitted) return { action: "admin_review" as const, winnerSlot: null, extensionHours: 0 };
  return { action: "continue" as const, winnerSlot: null, extensionHours: 0 };
}

const VALID_TOURNAMENT_SUBMISSION_STATUSES = new Set(["approved", "active"]);
const PENDING_TOURNAMENT_SUBMISSION_STATUSES = new Set(["submitted", "pending_moderation", "under_review", "submission_review"]);

export function resolveTournamentSubmissionDeadline(params: {
  participantAStatus?: string | null;
  participantBStatus?: string | null;
  extensionAlreadyUsed: boolean;
  submissionDeadlineAt: string;
  now: Date;
}) {
  const deadline = Date.parse(params.submissionDeadlineAt);
  if (!Number.isFinite(deadline)) return { action: "hold" as const, code: "SUBMISSION_DEADLINE_INVALID" };
  if (params.now.getTime() < deadline) return { action: "waiting" as const, code: "SUBMISSION_WINDOW_OPEN" };
  const statusA = String(params.participantAStatus ?? "");
  const statusB = String(params.participantBStatus ?? "");
  if ([statusA, statusB].some((status) => PENDING_TOURNAMENT_SUBMISSION_STATUSES.has(status))) {
    return { action: "review" as const, code: "SUBMISSION_MODERATION_PENDING" };
  }
  const submittedA = VALID_TOURNAMENT_SUBMISSION_STATUSES.has(statusA);
  const submittedB = VALID_TOURNAMENT_SUBMISSION_STATUSES.has(statusB);
  if (submittedA && submittedB) return { action: "open_voting" as const, code: "SUBMISSIONS_VALID" };
  const noSubmission = resolveTournamentNoSubmission({ participantASubmitted: submittedA, participantBSubmitted: submittedB, extensionAlreadyUsed: params.extensionAlreadyUsed });
  if (noSubmission.action === "extend") return { action: "extend" as const, code: "NO_VALID_SUBMISSIONS" };
  if (noSubmission.action === "forfeit") return { action: "forfeit" as const, winnerSlot: noSubmission.winnerSlot, code: "SINGLE_VALID_SUBMISSION" };
  if (noSubmission.action === "admin_review") return { action: "double_forfeit_hold" as const, code: "DOUBLE_FORFEIT_REQUIRES_PATH_HOLD" };
  return { action: "hold" as const, code: "SUBMISSION_STATE_UNRESOLVED" };
}

export function canUseLegacyTournamentAdminResultOverride(params: { configVersion: number; isAdmin: boolean; reason?: string | null }) {
  return params.configVersion < 3 && params.isAdmin && Boolean(params.reason?.trim());
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
    if (nextMatch.participantAId) return { advanced: false, code: "ADVANCEMENT_SLOT_OCCUPIED", nextMatch };
    nextMatch.participantAId = params.match.winnerParticipantId;
  }
  if (params.match.nextSlot === "B") {
    if (nextMatch.participantBId === params.match.winnerParticipantId) return { advanced: false, code: "ADVANCEMENT_ALREADY_APPLIED", nextMatch };
    if (nextMatch.participantBId) return { advanced: false, code: "ADVANCEMENT_SLOT_OCCUPIED", nextMatch };
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
  const sensitive = ["approve", "reject", "pause", "resume", "cancel", "lock_voting", "reopen_review", "resolve_dispute", "disqualify", "confirm_result", "approve_payout_foundation", "trigger_refund_foundation", "submission_approved", "submission_rejected"];
  return { action, adminRequired: sensitive.includes(action), auditRequired: sensitive.includes(action), payoutProviderCalled: false, rawVoteTotalEditable: false, balanceOverwriteAllowed: false };
}

export function deriveTournamentCorrectionImpact(matches: TournamentMatchFoundation[], sourceMatchId: string) {
  const byId = new Map(matches.map((match) => [match.id, match]));
  const affected = new Set<string>();
  const queue = [sourceMatchId];
  while (queue.length) {
    const currentId = queue.shift();
    if (!currentId || affected.has(currentId)) continue;
    const current = byId.get(currentId);
    if (!current) continue;
    affected.add(currentId);
    [current.nextMatchId, current.loserNextMatchId, current.resetMatchId].filter(Boolean).forEach((nextId) => queue.push(String(nextId)));
  }
  const downstream = [...affected].filter((matchId) => matchId !== sourceMatchId).map((matchId) => byId.get(matchId)).filter((match): match is TournamentMatchFoundation => Boolean(match));
  return {
    sourceMatchId,
    affectedMatchIds: [...affected],
    downstreamMatchIds: downstream.map((match) => match.id),
    downstreamMatches: downstream.map((match) => ({ id: match.id, roundNumber: match.roundNumber, matchNumber: match.matchNumber, bracket: match.bracket ?? "winners", status: match.status })),
    hasResolvedDownstream: downstream.some((match) => ["confirmed", "forfeit", "bye"].includes(match.status)),
    futureOnly: downstream.every((match) => ["pending", "ready", "waiting"].includes(match.status))
  };
}
