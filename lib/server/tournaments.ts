import type { TournamentFoundation } from "@/lib/tournament-types";

function text(value: unknown, fallback = "") {
  return typeof value === "string" && value.trim() ? value.trim() : fallback;
}

function positiveInteger(value: unknown, fallback: number) {
  const parsed = Math.trunc(Number(value));
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
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
    format: text(input.format, "single_elimination") as TournamentFoundation["format"],
    participantCapacity: positiveInteger(input.participantCapacity, 8),
    participantCount: 0,
    privacy: text(input.privacy, "public") as TournamentFoundation["privacy"],
    registrationType: text(input.registrationType, "open") as TournamentFoundation["registrationType"],
    registrationOpensAt: text(input.registrationOpensAt) || null,
    registrationClosesAt: text(input.registrationClosesAt) || null,
    tournamentStartsAt: text(input.tournamentStartsAt) || null,
    expectedEndAt: text(input.expectedEndAt) || null,
    entryType: "free",
    entryFeeAmountMinor: null,
    currency: "USD",
    eligibility: {},
    requiresCheckIn: Boolean(input.requiresCheckIn),
    seedingMethod: text(input.seedingMethod, "manual") as TournamentFoundation["seedingMethod"],
    resultMethod: text(input.resultMethod, "votes") as TournamentFoundation["resultMethod"],
    advancementMethod: text(input.advancementMethod, "bracket") as TournamentFoundation["advancementMethod"],
    voting: { paidVotesActive: false, webhookConfirmationRequired: true },
    judging: { setupRequired: true },
    tieBreaker: text(input.tieBreaker, "host_review") as TournamentFoundation["tieBreaker"],
    thirdPlaceMethod: text(input.thirdPlaceMethod, "none") as TournamentFoundation["thirdPlaceMethod"],
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
