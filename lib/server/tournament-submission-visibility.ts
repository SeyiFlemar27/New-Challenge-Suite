/** Shared by server projection and byte delivery; an approved entry alone is not public. */
export function tournamentSubmissionRevealed(input: {
  tournamentId: string;
  submission: Record<string, unknown>;
  match?: Record<string, unknown> | null;
  round?: Record<string, unknown> | null;
  now?: number;
}) {
  const { tournamentId, submission, match, round } = input;
  if (!match || match.tournamentId !== tournamentId || submission.tournamentId !== tournamentId
    || !submission.participantId || !submission.matchId || !submission.roundId
    || submission.matchId !== match.id || submission.roundId !== match.roundId
    || ![match.participantAId, match.participantBId].includes(submission.participantId)) return false;
  if (!["approved", "active", "eliminated", "winner"].includes(String(submission.status))) return false;
  if (!["voting_open", "voting_closed", "result_verification", "completed", "confirmed", "forfeit", "active", "awaiting_result", "review", "disputed"].includes(String(match.status))) return false;
  const legacyRoundStart = round?.tournamentId === tournamentId && round.id === match.roundId ? round.votingOpensAt : null;
  const revealAt = Date.parse(String(match.votingOpenedAt ?? legacyRoundStart ?? (match.status === "forfeit" ? match.submissionDeadlineAt : "")));
  return Number.isFinite(revealAt) && revealAt <= (input.now ?? Date.now());
}
