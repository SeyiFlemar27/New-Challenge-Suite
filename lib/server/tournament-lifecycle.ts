import type { TournamentStatus } from "@/lib/tournament-types";

export const TOURNAMENT_TRANSITIONS: Record<TournamentStatus, TournamentStatus[]> = {
  draft: ["pending_review", "scheduled", "cancelled"],
  pending_review: ["scheduled", "draft", "cancelled"],
  scheduled: ["registration_open", "paused", "cancelled"],
  registration_open: ["registration_closed", "paused", "cancelled"],
  registration_closed: ["seeding", "paused", "cancelled"],
  seeding: ["ready", "registration_open", "cancelled"],
  ready: ["active", "paused", "cancelled"],
  active: ["round_active", "paused", "cancelled"],
  round_active: ["round_review", "paused", "cancelled"],
  round_review: ["round_active", "final", "under_review", "cancelled"],
  final: ["under_review", "paused", "cancelled"],
  under_review: ["winners_announced", "round_review", "cancelled"],
  winners_announced: ["completed"],
  completed: [],
  paused: ["scheduled", "registration_open", "ready", "active", "cancelled"],
  cancelled: []
};

export function canTransitionTournamentStatus(from: TournamentStatus, to: TournamentStatus) {
  return TOURNAMENT_TRANSITIONS[from]?.includes(to) ?? false;
}

export function assertTournamentTransition(from: TournamentStatus, to: TournamentStatus) {
  if (!canTransitionTournamentStatus(from, to)) {
    return { valid: false, code: "INVALID_TOURNAMENT_TRANSITION", message: `Cannot transition tournament from ${from} to ${to}.` };
  }
  return { valid: true, code: "TOURNAMENT_TRANSITION_ALLOWED", message: "Tournament transition is allowed." };
}

export function canPublishTournament(status: TournamentStatus) { return ["draft", "pending_review"].includes(status); }
export function canOpenRegistration(status: TournamentStatus) { return status === "scheduled"; }
export function canCloseRegistration(status: TournamentStatus) { return status === "registration_open"; }
export function canGenerateBracket(status: TournamentStatus) { return status === "registration_closed"; }
export function canStartRound(status: TournamentStatus) { return ["ready", "active", "round_review"].includes(status); }
export function canCloseVoting(status: TournamentStatus) { return status === "round_active"; }
export function canConfirmMatchResult(status: TournamentStatus) { return status === "round_review"; }
export function canAdvanceRound(status: TournamentStatus) { return status === "round_review"; }
export function canCompleteTournament(status: TournamentStatus) { return status === "winners_announced"; }
export function canPauseTournament(status: TournamentStatus) { return !["completed", "cancelled"].includes(status); }
export function canCancelTournament(status: TournamentStatus) { return !["completed", "cancelled"].includes(status); }
