import type { TournamentFoundation, TournamentPrizeDistribution, TournamentResultMethod, TournamentRoundPlanItem } from "@/lib/tournament-types";

function text(value: unknown, fallback = "") {
  return typeof value === "string" && value.trim() ? value.trim() : fallback;
}

function positiveInteger(value: unknown, fallback: number) {
  const parsed = Math.trunc(Number(value));
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

export function singleEliminationMatchCount(capacity: number, includeBronzeMatch = false) {
  return Math.max(0, capacity - 1) + (includeBronzeMatch && capacity >= 4 ? 1 : 0);
}

export function singleEliminationStageCount(capacity: number) {
  return Math.max(0, Math.ceil(Math.log2(capacity)));
}

export function bracketSizeForParticipants(participantCount: number) {
  if (participantCount < 2) return 0;
  return 2 ** Math.ceil(Math.log2(participantCount));
}

export function doubleEliminationMatchCount(participantCount: number) {
  return participantCount < 2 ? 0 : (2 * participantCount) - 1;
}

export function roundTitlesForCapacity(capacity: number) {
  const titles: Record<number, string[]> = {
    4: ["Semifinal", "Final"],
    8: ["Quarterfinal", "Semifinal", "Final"],
    16: ["Round of 16", "Quarterfinal", "Semifinal", "Final"],
    32: ["Round of 32", "Round of 16", "Quarterfinal", "Semifinal", "Final"],
    64: ["Round of 64", "Round of 32", "Round of 16", "Quarterfinal", "Semifinal", "Final"],
    128: ["Round of 128", "Round of 64", "Round of 32", "Round of 16", "Quarterfinal", "Semifinal", "Final"]
  };
  return titles[capacity] ?? [];
}

export function buildRoundPlan(capacity: number, resultMethod: TournamentResultMethod = "votes", thirdPlaceMethod = "none"): TournamentRoundPlanItem[] {
  const base = roundTitlesForCapacity(capacity).map((title, index) => ({
    roundNumber: index + 1,
    title,
    brief: "",
    submissionOpensAt: null,
    submissionDeadlineAt: null,
    votingOpensAt: null,
    votingClosesAt: null,
    acceptedMedia: ["image", "video"] as ("image" | "video")[],
    resultMethod,
    advancementRule: title === "Final" ? "final_placements_after_review" : "winner_advances_to_next_round"
  }));
  if (thirdPlaceMethod === "bronze_match" || thirdPlaceMethod === "third_place_match") {
    base.push({
      roundNumber: base.length + 1,
      title: "Bronze Match",
      brief: "",
      submissionOpensAt: null,
      submissionDeadlineAt: null,
      votingOpensAt: null,
      votingClosesAt: null,
      acceptedMedia: ["image", "video"],
      resultMethod,
      advancementRule: "winner_receives_third_place_after_review"
    });
  }
  return base;
}

export function buildRoundRobinPlan(capacity: number, resultMethod: TournamentResultMethod = "votes"): TournamentRoundPlanItem[] {
  return Array.from({ length: Math.max(1, capacity - 1) }, (_, index) => ({
    roundNumber: index + 1,
    title: `Round ${index + 1}`,
    brief: "Round-robin pairings are generated from confirmed registrations after registration closes.",
    submissionOpensAt: null,
    submissionDeadlineAt: null,
    votingOpensAt: null,
    votingClosesAt: null,
    acceptedMedia: ["image", "video"] as ("image" | "video")[],
    resultMethod,
    advancementRule: "points_table_after_confirmed_results"
  }));
}

export function defaultPrizeDistribution(): TournamentPrizeDistribution[] {
  return [{ placement: 1, percent: 25 }, { placement: 2, percent: 20 }, { placement: 3, percent: 20 }];
}

export function tournamentDraftFromInput(input: Record<string, unknown>, hostId: string, now = new Date().toISOString()): Omit<TournamentFoundation, "id"> {
  return {
    hostId,
    title: text(input.title),
    shortDescription: text(input.shortDescription),
    description: text(input.description),
    category: text(input.category),
    coverMedia: { url: text(input.coverImageUrl) || null, path: text(input.coverImagePath) || null, status: text(input.coverImageUrl) ? "uploaded" : "missing" },
    trailerMedia: { url: text(input.trailerUrl) || null, path: text(input.trailerPath) || null, status: text(input.trailerUrl) ? "uploaded" : "missing" },
    status: "draft",
    configVersion: 2,
    format: text(input.format, "single_elimination") as TournamentFoundation["format"],
    participationMode: text(input.participationMode, "individual") === "team" ? "team" : "individual",
    participantCapacity: positiveInteger(input.participantCapacity, 8),
    participantCount: 0,
    privacy: text(input.privacy, "public") as TournamentFoundation["privacy"],
    registrationType: text(input.registrationType, "open") === "invite_only" ? "invite_only" : "open",
    roundPlan: buildRoundPlan(positiveInteger(input.participantCapacity, 8), text(input.resultMethod, "votes") as TournamentResultMethod, text(input.thirdPlaceMethod, "none")),
    registrationOpensAt: text(input.registrationOpensAt) || null,
    registrationClosesAt: text(input.registrationClosesAt) || null,
    tournamentStartsAt: text(input.tournamentStartsAt) || null,
    expectedEndAt: text(input.expectedEndAt) || null,
    entryType: text(input.entryType, "free") === "paid_entry_setup_required" ? "paid_entry_setup_required" : "free",
    entryFeeAmountMinor: text(input.entryType, "free") === "paid_entry_setup_required" ? Math.max(0, Math.trunc(Number(input.entryFeeAmountMinor ?? 0))) : null,
    currency: text(input.currency, "USD").toUpperCase(),
    eligibility: input.eligibility && typeof input.eligibility === "object" ? input.eligibility as Record<string, unknown> : {},
    requiresCheckIn: Boolean(input.requiresCheckIn),
    checkInClosesAt: text(input.checkInClosesAt) || null,
    teamConfig: text(input.participationMode) === "team" ? { minimumSize: positiveInteger(input.minimumTeamSize, 2), maximumSize: Math.min(20, positiveInteger(input.maximumTeamSize, 5)), joiningMode: text(input.teamJoiningMode) === "invite_and_requests" ? "invite_and_requests" : "invite_only", captainPaysEntryFee: true, rosterLocksAtCheckInClose: true } : null,
    seedingMethod: "ranking",
    resultMethod: text(input.resultMethod, "votes") as TournamentFoundation["resultMethod"],
    advancementMethod: text(input.advancementMethod, "bracket") as TournamentFoundation["advancementMethod"],
    voting: { paidVotesActive: false, webhookConfirmationRequired: true },
    judging: { setupRequired: true },
    tieBreaker: text(input.tieBreaker, "host_review") as TournamentFoundation["tieBreaker"],
    thirdPlaceMethod: text(input.thirdPlaceMethod, "none") as TournamentFoundation["thirdPlaceMethod"],
    scoreVisibility: text(input.scoreVisibility, "final_only") as TournamentFoundation["scoreVisibility"],
    prizeDistribution: Array.isArray(input.prizeDistribution) ? input.prizeDistribution as TournamentPrizeDistribution[] : defaultPrizeDistribution(),
    readiness: { readyToLaunch: false, lastCheckedAt: now, blockingErrors: [], warnings: [] },
    currentRoundId: null,
    currentRoundNumber: 0,
    prizePool: { confirmedPrizePoolMinor: 0, fakePrizePoolAllowed: false, adminApprovalRequired: true },
    sponsorship: { sponsorReady: Boolean(input.sponsorReady), confirmedSponsorFundingMinor: 0, sponsorFundsGoToWinnersPercent: 100 },
    dispute: { enabled: true, adminReviewRequired: true },
    cancellationRefund: { setupRequired: true, automaticRefundsEnabled: false },
    hostManagement: { bracketGenerationEnabled: false, fakeParticipantsAllowed: false, fakeMatchesAllowed: false },
    createdAt: now,
    updatedAt: now,
    publishedAt: null,
    completedAt: null
  };
}

export function tournamentSubdomainFoundation() {
  return {
    tournamentParticipants: { implemented: "model_foundation", fakeRecordsAllowed: false },
    tournamentTeams: { implemented: "server_authoritative", memberRosterPublic: false, captainSubmissionRequired: true },
    tournamentRounds: { implemented: "model_foundation", bracketGenerationEnabled: false },
    tournamentMatches: { implemented: "model_foundation", fakeMatchesAllowed: false },
    tournamentSubmissions: { implemented: "model_foundation", realMediaRequired: true },
    tournamentVotes: { implemented: "model_foundation", paidVotesWebhookRequired: true },
    tournamentJudges: { implemented: "model_foundation" },
    tournamentJudgeScores: { implemented: "model_foundation" },
    tournamentInvitations: { implemented: "model_foundation" },
    tournamentWaitlist: { implemented: "model_foundation" },
    tournamentAnnouncements: { implemented: "model_foundation" },
    tournamentReports: { implemented: "model_foundation" },
    tournamentDisputes: { implemented: "model_foundation" },
    tournamentPrizePools: { implemented: "model_foundation", confirmedSourcesOnly: true },
    tournamentPayouts: { implemented: "model_foundation", payoutProviderCalled: false }
  };
}

export function evaluateTournamentReadiness(tournament: Record<string, unknown>) {
  const errors: string[] = [];
  const warnings: string[] = [];
  if (!text(tournament.title)) errors.push("Tournament name is required.");
  if (!text(tournament.description)) errors.push("Full description is required.");
  if (!text(tournament.category)) errors.push("Category is required.");
  if (text((tournament.coverMedia as Record<string, unknown> | undefined)?.status) !== "uploaded" && text((tournament.coverMedia as Record<string, unknown> | undefined)?.status) !== "storage_disabled") errors.push("Cover media must be uploaded unless storage-disabled mode is active.");
  if (!["single_elimination", "double_elimination"].includes(text(tournament.format))) errors.push("Choose Single Elimination or Double Elimination.");
  if (![4, 8, 16, 32, 64, 128].includes(Number(tournament.participantCapacity))) errors.push("Choose a bracket size of 4, 8, 16, 32, 64, or 128.");
  if (!["individual", "team"].includes(text(tournament.participationMode))) errors.push("Choose Individual or Team tournament participation.");
  if (text(tournament.participationMode) === "team") {
    const config = tournament.teamConfig as Record<string, unknown> | undefined;
    const minimum = Number(config?.minimumSize ?? 0);
    const maximum = Number(config?.maximumSize ?? 0);
    if (!Number.isInteger(minimum) || !Number.isInteger(maximum) || minimum < 1 || minimum > maximum || maximum > 20) errors.push("Team size must satisfy 1 <= minimum <= maximum <= 20.");
  }
  if (!text(tournament.registrationOpensAt) || !text(tournament.registrationClosesAt) || !text(tournament.tournamentStartsAt)) errors.push("Registration and tournament dates are required.");
  if (!Array.isArray(tournament.roundPlan) || !tournament.roundPlan.length) errors.push("Round plan is required.");
  if (!text(tournament.tieBreaker)) errors.push("Tie-breaker is required.");
  const distribution = Array.isArray(tournament.prizeDistribution) ? tournament.prizeDistribution as TournamentPrizeDistribution[] : [];
  if (distribution.reduce((sum, item) => sum + Number(item.percent ?? 0), 0) !== 65) errors.push("Winner allocations must total 65% of eligible generated revenue.");
  if (text(tournament.entryType) === "paid_entry_setup_required") warnings.push("Paid entry requires provider-confirmed checkout before registrations can become paid.");
  if (Number((tournament.prizePool as Record<string, unknown> | undefined)?.confirmedPrizePoolMinor ?? 0) <= 0) warnings.push("No confirmed prize funding is available yet.");
  return { ready: errors.length === 0, errors, warnings };
}
