type Match = Record<string, unknown> & { id: string };
const openStates = new Set(["submissions_open", "submission_review", "voting_open", "voting_closed", "result_verification", "ready", "active", "awaiting_result", "review"]);
export function votingMatchSequence<T extends Match>(matches: T[], competitorId: string | null, isHost: boolean, now = Date.now()): T[] {
  if (isHost) return [];
  return matches.filter(match => match.status === "voting_open" && Boolean(match.participantAId && match.participantBId)
    && (!competitorId || ![match.participantAId, match.participantBId].includes(competitorId))
    && Date.parse(String(match.votingClosesAt ?? "")) > now)
    .sort((a, b) => Number(a.roundNumber ?? 0) - Number(b.roundNumber ?? 0) || Number(a.matchNumber ?? 0) - Number(b.matchNumber ?? 0) || a.id.localeCompare(b.id));
}
export function participantMatches<T extends Match>(matches: T[], competitorId: string | null): T[] {
  if (!competitorId) return [];
  return matches.filter(match => [match.participantAId, match.participantBId].includes(competitorId));
}
/** Own actionable match first; unrelated matches and hypothetical dependencies never become a personal action. */
export function currentParticipantMatch<T extends Match>(matches: T[], competitorId: string | null): T | null {
  const deadline = (match: Match) => {
    const value = Date.parse(String(match.status === "submissions_open" ? match.submissionDeadlineAt ?? "" : match.votingClosesAt ?? ""));
    return Number.isFinite(value) ? value : Infinity;
  };
  return participantMatches(matches, competitorId).filter(match => openStates.has(String(match.status)))
    .sort((a, b) => Number(b.status === "submissions_open") - Number(a.status === "submissions_open") || deadline(a) - deadline(b) || a.id.localeCompare(b.id))[0] ?? null;
}
