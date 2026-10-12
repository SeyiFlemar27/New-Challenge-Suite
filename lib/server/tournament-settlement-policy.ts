export function validateTournamentPlacementEvidence(tournament: Record<string, unknown>, placement: Record<string, unknown>, match: Record<string, unknown>) {
  const position = Number(placement.placement);
  const participantId = String(placement.participantId ?? "");
  if (!participantId || match.tournamentId !== tournament.id || !["confirmed", "forfeit"].includes(String(match.status ?? ""))) return false;
  const winnerId = String(match.winnerParticipantId ?? "");
  const loserId = String(match.loserParticipantId ?? "");
  if (!winnerId || !loserId || winnerId === loserId || ![match.participantAId, match.participantBId].includes(winnerId) || ![match.participantAId, match.participantBId].includes(loserId)) return false;
  if (position === 1) {
    return participantId === winnerId && (tournament.format === "double_elimination" ? match.bracket === "grand_final" : !match.nextMatchId && match.bracket !== "bronze");
  }
  if (position === 2) {
    return participantId === loserId && (tournament.format === "double_elimination" ? match.bracket === "grand_final" : !match.nextMatchId && match.bracket !== "bronze");
  }
  if (position === 3 && tournament.format === "single_elimination") return match.bracket === "bronze" && participantId === winnerId;
  if (position === 3 && tournament.format === "double_elimination") return match.bracket === "losers" && String(match.nextMatchId ?? "").endsWith("_grand_final") && participantId === loserId;
  return false;
}
