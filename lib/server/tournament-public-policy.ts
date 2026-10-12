type TournamentRow = Record<string, unknown> & { id: string };

const PUBLIC_TOURNAMENT_FIELDS = [
  "id", "title", "description", "category", "format", "participationMode", "participantCapacity", "participantCount",
  "privacy", "registrationType", "status", "createdAt", "updatedAt", "registrationOpensAt", "registrationClosesAt",
  "tournamentStartsAt", "expectedEndAt", "submissionDurationHours", "votingDurationHours", "entryType", "entryFeeAmountMinor",
  "currency", "coverMedia", "teamConfig", "prizeDistribution", "scoreVisibility", "currentRoundNumber", "bracketGeneratedAt"
] as const;

export function publicTournamentView(tournament: TournamentRow): TournamentRow {
  const view: TournamentRow = { id: tournament.id };
  for (const field of PUBLIC_TOURNAMENT_FIELDS) {
    if (field === "id" || !(field in tournament)) continue;
    if (field === "coverMedia") {
      const media = tournament.coverMedia as Record<string, unknown> | null;
      view.coverMedia = media && typeof media.url === "string" ? { url: media.url } : null;
    } else if (field === "teamConfig") {
      const config = tournament.teamConfig as Record<string, unknown> | null;
      view.teamConfig = config ? { minimumSize: config.minimumSize, maximumSize: config.maximumSize } : null;
    } else {
      view[field] = tournament[field];
    }
  }
  const prizePool = tournament.prizePool as Record<string, unknown> | undefined;
  if (prizePool && "confirmedPrizePoolMinor" in prizePool) {
    view.prizePool = { confirmedPrizePoolMinor: Number(prizePool.confirmedPrizePoolMinor) || 0 };
  }
  return view;
}

export function publicTournamentParticipantView(participant: TournamentRow, publicId = participant.id) {
  const view: Record<string, unknown> = { id: publicId };
  for (const key of ["status", "seed", "memberCount"]) if (key in participant) view[key] = participant[key];
  if (participant.publicDisplayName === true && typeof participant.displayName === "string") view.displayName = participant.displayName;
  if (participant.tournamentId && participant.name && participant.publicDisplayName !== false) view.displayName = participant.name;
  return view;
}

export function publicTournamentParticipantIds(participants: TournamentRow[]) {
  return new Map([...participants]
    .sort((left, right) => Number(left.seed ?? Number.MAX_SAFE_INTEGER) - Number(right.seed ?? Number.MAX_SAFE_INTEGER) || left.id.localeCompare(right.id))
    .map((participant, index) => [participant.id, `entrant-${index + 1}`] as const));
}
