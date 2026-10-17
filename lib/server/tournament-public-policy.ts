type TournamentRow = Record<string, unknown> & { id: string };
export function isPublishedTournament(tournament: Record<string, unknown>) {
  return ["scheduled", "registration_open", "registration_closed", "seeding", "ready", "active", "round_active", "round_review", "final", "under_review", "winners_announced", "completed", "paused", "cancelled"].includes(String(tournament.status));
}

const PUBLIC_TOURNAMENT_FIELDS = [
  "id", "title", "description", "category", "subcategory", "tournamentRules", "submissionInstructions", "submissionMediaTypes", "format", "participationMode", "participantCapacity", "participantCount", "configVersion",
  "privacy", "registrationType", "status", "createdAt", "updatedAt", "registrationOpensAt", "registrationClosesAt",
  "tournamentStartsAt", "expectedEndAt", "submissionDurationHours", "votingDurationHours", "entryType", "entryFeeAmountMinor",
  "currency", "coverMedia", "teamConfig", "prizeDistribution", "scoreVisibility", "currentRoundNumber", "bracketGeneratedAt", "basePrizeAmountMinor"
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
  const verifiedMedia = tournament.creatorMediaVerification as { gallery?: Array<{ url?: string }>; trailer?: { url?: string } } | undefined;
  if (verifiedMedia) {
    view.galleryMedia = (verifiedMedia.gallery ?? []).filter(item => typeof item.url === "string").map(item => ({ url: item.url }));
    view.trailerMedia = verifiedMedia.trailer?.url ? { url: verifiedMedia.trailer.url } : null;
  }
  if (prizePool && "confirmedPrizePoolMinor" in prizePool) {
    view.prizePool = prizePool.status === "under_review" ? { confirmedPrizePoolMinor: null, status: "under_review" } : { confirmedPrizePoolMinor: Number(prizePool.confirmedPrizePoolMinor) || 0, status: "confirmed_sources" };
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
    .filter(participant => !["forming", "pending", "rejected", "withdrawn"].includes(String(participant.status)))
    .sort((left, right) => Number(left.seed ?? Number.MAX_SAFE_INTEGER) - Number(right.seed ?? Number.MAX_SAFE_INTEGER) || left.id.localeCompare(right.id))
    .map((participant, index) => [participant.id, `entrant-${index + 1}`] as const));
}
