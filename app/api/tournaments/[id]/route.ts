import { challengeReviewBuilderDestination } from "@/lib/notification-navigation";
import { getAdminDb } from "@/lib/firebase/admin";
import { getOptionalRequestUser, requireRequestUser } from "@/lib/server/auth";
import { fail, ok, readJson, serverUnavailable, validationError } from "@/lib/server/responses";
import { canEditTournament } from "@/lib/server/tournament-permissions";
import { assertTournamentTransition } from "@/lib/server/tournament-lifecycle";
import { validateTournamentFoundation } from "@/lib/server/tournament-validation";
import { evaluateTournamentReadiness } from "@/lib/server/tournaments";
import { getTournamentBundle } from "@/lib/server/tournament-public";
import { publicTournamentParticipantIds, publicTournamentParticipantView, publicTournamentView } from "@/lib/server/tournament-public-policy";
import type { TournamentFoundation, TournamentStatus } from "@/lib/tournament-types";
import { freezeTournamentBuilderMedia, normalizeTournamentReviewMedia, verifyTournamentBuilderMedia } from "@/lib/server/tournament-media-verification";
import { mediaVerificationFailure } from "@/lib/server/media-verification-errors";
import { getTournamentCreatorFunding } from "@/lib/server/tournament-creator-funding";
import { TOURNAMENT_PRODUCT_POLICY } from "@/lib/tournament-builder-policy";

export const dynamic = "force-dynamic";

export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const viewer = await getOptionalRequestUser(request);
  if (new URL(request.url).searchParams.get("view") === "builder") {
    if (!viewer) return fail("Sign in to restore your Tournament draft.", 401, undefined, "AUTH_REQUIRED");
    const db = getAdminDb();
    if (!db) return serverUnavailable("Tournament draft restoration");
    const snapshot = await db.collection("tournaments").doc(id).get();
    if (!snapshot.exists) return fail("Tournament not found.", 404, undefined, "TOURNAMENT_NOT_FOUND");
    const record = normalizeTournamentReviewMedia({ id: snapshot.id, ...snapshot.data() });
    if (!canEditTournament({ ...viewer }, record).allowed) return fail("Tournament manager permission is required.", 403, undefined, "TOURNAMENT_MANAGER_REQUIRED");
    const fields = ["id", "status", "title", "description", "category", "subcategory", "tournamentRules", "coverMedia", "coverImageUrl", "coverImagePath", "trailerMedia", "trailerUrl", "trailerPath", "galleryMedia", "format", "participationMode", "participantCapacity", "teamConfig", "teamPaymentWindowMinutes", "entryType", "entryFeeAmountMinor", "basePrizeAmountMinor", "confirmedCreatorPrizeFundingCents", "creatorPrizeFundingStatus", "submissionDurationHours", "votingDurationHours", "submissionInstructions", "submissionMediaTypes", "sponsorship", "builderCurrentStep", "builderUnlockedStep", "builderCurrentStepIndex", "builderNavigationVersion", "productPolicyVersion", "updatedAt", "voting", "privacy", "registrationType"];
    fields.push("reviewStatus", "reviewReason", "reviewedAt");
    const funding = await getTournamentCreatorFunding(db, id, record);
    return ok({ tournament: { ...Object.fromEntries(fields.filter(field => field in record).map(field => [field, record[field]])), confirmedCreatorPrizeFundingCents: funding.confirmedCreatorCents, creatorPrizeFundingStatus: funding.reviewCount ? "review_required" : funding.pendingCount ? "pending_confirmation" : funding.confirmedCreatorCents > 0 ? "confirmed" : "not_funded" } }, "Tournament draft restored.");
  }
  const bundle = await getTournamentBundle(id, viewer);
  if (!bundle.available && bundle.message === "Tournament not found or unavailable.") return fail("Tournament not found.", 404, undefined, "TOURNAMENT_NOT_FOUND");
  if (!bundle.available) return ok({ tournament: bundle.tournament, participants: [], rounds: [], matches: [], announcements: [], sponsors: [] }, bundle.message);
  if (!bundle.tournament) return fail("Tournament not found.", 404, undefined, "TOURNAMENT_NOT_FOUND");
  const publicIds = publicTournamentParticipantIds(bundle.participants);
  return ok({
    tournament: publicTournamentView(bundle.tournament),
    participants: bundle.participants.filter(item => publicIds.has(item.id)).slice(0, 128).map((item) => publicTournamentParticipantView(item, publicIds.get(item.id) ?? "entrant")),
    rounds: bundle.rounds.sort((a, b) => Number(a.roundNumber ?? 0) - Number(b.roundNumber ?? 0)).slice(0, 20).map((round) => Object.fromEntries(Object.entries(round).filter(([key]) => ["id", "roundNumber", "bracket", "status", "startsAt", "endsAt", "votingOpensAt", "votingClosesAt"].includes(key)))),
    matches: bundle.matches.sort((a, b) => Number(a.roundNumber ?? 0) - Number(b.roundNumber ?? 0) || Number(a.matchNumber ?? 0) - Number(b.matchNumber ?? 0)).slice(0, 260).map((match) => {
      const safe: Record<string, unknown> = Object.fromEntries(Object.entries(match).filter(([key]) => ["id", "roundId", "roundNumber", "matchNumber", "bracket", "status", "resultStatus", "openedAt", "submissionsOpenedAt", "submissionDeadlineAt", "votingOpenedAt", "votingClosesAt", "votingClosedAt", "dependencyHoldReason", "noSubmissionExtensionUsed", "doubleForfeitAt"].includes(key)));
      if (match.status === "confirmed" && match.resultStatus === "confirmed") {
        for (const field of ["verifiedVoteCountA", "verifiedVoteCountB"] as const) {
          const count = match[field];
          if (Number.isSafeInteger(count) && Number(count) >= 0) safe[field] = Number(count);
        }
      }
      for (const key of ["participantAId", "participantBId", "winnerParticipantId", "loserParticipantId"] as const) {
        const value = match[key];
        if (typeof value === "string") safe[key] = publicIds.get(value) ?? null;
      }
      return safe;
    }),
    announcements: bundle.announcements.slice(0, 20).map((item) => Object.fromEntries(Object.entries(item).filter(([key]) => ["id", "title", "body", "createdAt"].includes(key)))),
    sponsors: bundle.sponsors.slice(0, 10).map((item, index) => ({ id: `approved-sponsor-${index + 1}`, displayName: String(item.displayName ?? item.brandName ?? "Sponsor") }))
  }, "Tournament loaded.");
}

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  const { user, response } = await requireRequestUser(request);
  if (response) return response;
  const db = getAdminDb();
  if (!db) return serverUnavailable("Tournament update");
  const { id } = await context.params;
  const ref = db.collection("tournaments").doc(id);
  const snap = await ref.get();
  if (!snap.exists) return fail("Tournament not found.", 404, undefined, "TOURNAMENT_NOT_FOUND");
  const tournament = normalizeTournamentReviewMedia({ id: snap.id, ...snap.data() }) as TournamentFoundation;
  const permission = canEditTournament({ uid: user.uid, role: user.role, isAdmin: user.isAdmin }, tournament);
  if (!permission.allowed) return fail("Tournament manager permission is required.", 403, permission, "TOURNAMENT_MANAGER_REQUIRED");
  const parsed = await readJson(request);
  if (parsed.response) return parsed.response;
  const body = parsed.body && typeof parsed.body === "object" ? parsed.body as Record<string, unknown> : {};
  if (Number(tournament.configVersion ?? 1) >= 3 && tournament.status !== "draft") {
    if (tournament.status === "pending_review" && body.status === "pending_review" && Object.keys(body).every(key => ["status", "expectedUpdatedAt"].includes(key))) return ok({ tournament }, "Your challenge has been submitted for review.");
    return fail("Tournament editing is unavailable during review or after publication.", 409, undefined, "TOURNAMENT_NOT_EDITABLE");
  }
  const expectedUpdatedAt = body.expectedUpdatedAt;
  delete body.expectedUpdatedAt;
  const immutableFields = ["id", "hostId", "creatorId", "createdAt", "ownershipType", "officialChallenge", "enterpriseOrganizationId", "configVersion", "productPolicyVersion"];
  if (tournament.productPolicyVersion === TOURNAMENT_PRODUCT_POLICY) {
    const editable = new Set([...immutableFields, "title", "description", "category", "subcategory", "tournamentRules", "submissionInstructions", "submissionMediaTypes", "basePrizeAmountMinor", "galleryMedia", "coverImageUrl", "coverImagePath", "trailerUrl", "trailerPath", "coverMedia", "trailerMedia", "format", "participationMode", "participantCapacity", "minimumTeamSize", "maximumTeamSize", "teamJoiningMode", "teamPaymentWindowMinutes", "privacy", "registrationType", "submissionDurationHours", "votingDurationHours", "paidVotingEnabled", "seedingMethod", "resultMethod", "scoreVisibility", "tieBreaker", "thirdPlaceMethod", "entryType", "entryFeeAmountMinor", "currency", "sponsorReady", "acceptSponsorshipProposals", "sponsorshipGoal", "sponsorCategories", "sponsorNote", "sponsorPlacementPreferences", "sponsorship", "prizeDistribution", "roundPlan", "eligibility", "builderCurrentStep", "builderUnlockedStep", "builderNavigationVersion", "status"]);
    if (Object.keys(body).some(field => !editable.has(field))) return fail("This field cannot be edited through the Tournament Builder.", 409, undefined, "TOURNAMENT_SERVER_STATE_REQUIRED");
  }
  if (immutableFields.some((field) => field in body && String(body[field] ?? "") !== String((tournament as unknown as Record<string, unknown>)[field] ?? ""))) return fail("Tournament identity and ownership fields cannot be changed after creation.", 409, undefined, "TOURNAMENT_IDENTITY_LOCKED");
  if (Number(tournament.configVersion ?? 1) >= 3) {
    const serverOwnedFields = ["confirmedCreatorPrizeFundingCents", "creatorPrizeFundingStatus", "creatorPrizeGuaranteeLockedAt", "creatorPrizeGuaranteeCents", "monetization", "participantCount", "timingLockedAt", "activationState", "activationVersion", "activationWindowEndsAt", "activationActivatedAt", "activationHoldReason", "registrationLockedAt", "seedsLockedAt", "bracketGeneratedAt", "bracketLockedAt", "currentRoundId", "currentRoundNumber", "winnerParticipantId", "officialPlacementsFinalizedAt", "officialPlacementsFinalizedBy", "settlementId", "settlementStatus", "settlementPlacementFingerprint", "creatorPlacementReviewFingerprint", "payoutExecutionEnabled", "paymentActivationEnabled", "bracketExecutionEnabled", "firstVotingOpenedAt", "tournamentVotingCutoffAt", "registrationRefundCutoffAt", "prizePool", "confirmedPrizePoolMinor", "winnerIds", "winnerUserIds"];
    if (serverOwnedFields.some((field) => field in body)) return fail("Tournament execution and financial state is server-managed.", 409, undefined, "TOURNAMENT_SERVER_STATE_REQUIRED");
    if (body.configVersion !== undefined && Number(body.configVersion) !== Number(tournament.configVersion)) return fail("Tournament configuration version cannot be changed.", 409, undefined, "TOURNAMENT_VERSION_LOCKED");
    if (tournament.timingLockedAt && ((body.submissionDurationHours !== undefined && Number(body.submissionDurationHours) !== Number(tournament.submissionDurationHours)) || (body.votingDurationHours !== undefined && Number(body.votingDurationHours) !== Number(tournament.votingDurationHours)))) return fail("Round timing is locked after the first confirmed entrant.", 409, undefined, "TOURNAMENT_TIMING_LOCKED");
    if (body.status !== undefined && body.status !== tournament.status && !(tournament.status === "draft" && body.status === "pending_review")) return fail("Tournament lifecycle state is controlled by review and server-side competition events.", 409, undefined, "TOURNAMENT_SERVER_TRANSITION_REQUIRED");
  }
  if (body.ownershipType !== undefined && body.ownershipType !== tournament.ownershipType) return fail("Tournament ownership cannot be changed after creation.", 409, undefined, "TOURNAMENT_OWNERSHIP_LOCKED");
  if (body.officialChallenge !== undefined && Boolean(body.officialChallenge) !== Boolean(tournament.officialChallenge)) return fail("Tournament ownership cannot be changed after creation.", 409, undefined, "TOURNAMENT_OWNERSHIP_LOCKED");
  if (body.status && body.status !== tournament.status) {
    const transition = assertTournamentTransition(String(tournament.status ?? "draft") as TournamentStatus, String(body.status) as TournamentStatus);
    if (!transition.valid) return fail(transition.message, 409, transition, transition.code);
  }
  const mediaFields = ["coverImageUrl", "coverImagePath", "trailerUrl", "trailerPath", "galleryMedia"];
  const validation = validateTournamentFoundation({ ...tournament, ...body }, { publish: body.status === "scheduled" || body.status === "pending_review", ownerId: String(tournament.hostId ?? user.uid), validateMedia: body.status === "pending_review" || mediaFields.some((field) => field in body) });
  if (!validation.valid) return validationError(Object.fromEntries(validation.errors.map((issue) => [issue.field, issue.message])));
  const merged = { ...tournament, ...body };
  const readiness = evaluateTournamentReadiness(merged);
  if (body.status === "pending_review" && !readiness.ready) return fail("Tournament details need attention before review.", 422, { fieldErrors: readiness.errors }, "TOURNAMENT_NOT_READY");
  const now = new Date().toISOString();
  const transitionToReview = tournament.status !== "pending_review" && body.status === "pending_review";
  const reviewRevision = Math.max(0, Number((tournament as unknown as Record<string, unknown>).reviewRevision ?? 0)) + 1;
  let creatorMediaVerification = null;
  if (transitionToReview) {
    try { creatorMediaVerification = await freezeTournamentBuilderMedia(id, await verifyTournamentBuilderMedia(merged as unknown as Record<string, unknown>, String(tournament.hostId ?? user.uid))); }
    catch (error) { const diagnostic = mediaVerificationFailure(error, `TPUB-${crypto.randomUUID().slice(0,8)}`); console.warn("[tournament-media-verification]", {category:diagnostic.category,stage:diagnostic.stage,requestId:diagnostic.requestId}); return fail(diagnostic.message, diagnostic.status, {requestId:diagnostic.requestId}, diagnostic.code); }
  }
  const update = { ...body, ...(transitionToReview ? { submittedAt: now, reviewRevision, reviewStatus: "pending_review" } : {}), readiness, updatedAt: now, bracketExecutionEnabled: true, paymentActivationEnabled: false, payoutExecutionEnabled: false };
  if (tournament.productPolicyVersion === TOURNAMENT_PRODUCT_POLICY) Object.assign(update, {
    sponsorship: { ...tournament.sponsorship, sponsorReady: body.sponsorReady === undefined ? tournament.sponsorship?.sponsorReady === true : body.sponsorReady === true },
  });
  if (body.minimumTeamSize !== undefined || body.maximumTeamSize !== undefined || body.teamJoiningMode !== undefined || body.participationMode !== undefined) {
    Object.assign(update, { teamConfig: merged.participationMode === "team" ? { ...tournament.teamConfig, captainPaysEntryFee: tournament.productPolicyVersion === TOURNAMENT_PRODUCT_POLICY ? false : tournament.teamConfig?.captainPaysEntryFee === true, minimumSize: Number(body.minimumTeamSize ?? tournament.teamConfig?.minimumSize ?? 2), maximumSize: Number(body.maximumTeamSize ?? tournament.teamConfig?.maximumSize ?? 5), joiningMode: body.teamJoiningMode ?? tournament.teamConfig?.joiningMode ?? "invite_and_requests", rosterLocksAtCapacity: true, rosterLocksAtCheckInClose: false } : null });
  }
  if (creatorMediaVerification) Object.assign(update, { creatorMediaVerification, coverMedia: { ...merged.coverMedia, path: creatorMediaVerification.cover.path, url: creatorMediaVerification.cover.url } });
  try {
    await db.runTransaction(async transaction => {
      const current = await transaction.get(ref);
      if (expectedUpdatedAt !== undefined && current.data()?.updatedAt !== expectedUpdatedAt) throw Object.assign(new Error("The draft changed in another request. Your unsaved edits are preserved here; review the latest draft before saving."), { code: "TOURNAMENT_DRAFT_STALE" });
      if (!current.exists || (Number(current.data()?.configVersion ?? 1) >= 3 && current.data()?.status !== "draft") || current.data()?.updatedAt !== tournament.updatedAt) throw Object.assign(new Error("The draft changed. Refresh before saving again."), { code: "TOURNAMENT_DRAFT_STALE" });
      if (!canEditTournament({ ...user }, current.data() ?? {}).allowed) throw Object.assign(new Error("Tournament editing permission changed. Refresh before saving again."), { code: "TOURNAMENT_MANAGER_REQUIRED" });
      const funding = await getTournamentCreatorFunding(db, id, current.data() ?? {}, transaction);
      if (body.basePrizeAmountMinor !== undefined && Number(body.basePrizeAmountMinor) !== Number(current.data()?.basePrizeAmountMinor ?? 0)
        && (funding.recordCount > 0 || funding.pendingCount > 0 || funding.reviewCount > 0 || current.data()?.creatorPrizeGuaranteeLockedAt)) throw Object.assign(new Error("A funded or pending Base Prize cannot be changed. Contact support for reconciliation."), { code: "BASE_PRIZE_COMMITMENT_LOCKED" });
      const requiredCents = Number(body.basePrizeAmountMinor ?? current.data()?.basePrizeAmountMinor ?? 0);
      if (transitionToReview && requiredCents > funding.confirmedCreatorCents) throw Object.assign(new Error(`Your Base Prize is $${(requiredCents / 100).toFixed(2)}, but $${(funding.confirmedCreatorCents / 100).toFixed(2)} is confirmed. Fund the remaining $${((requiredCents - funding.confirmedCreatorCents) / 100).toFixed(2)} before Admin Review.`), { code: "BASE_PRIZE_FUNDING_REQUIRED" });
      transaction.set(ref, update, { merge: true });
      if (transitionToReview) {
        transaction.set(db.collection("tournamentReviewRequests").doc(`${id}_initial`), { id: `${id}_initial`, tournamentId: id, hostId: user.uid, status: "pending_review", revision: 1, createdAt: now, updatedAt: now });
        transaction.set(db.collection("tournamentReviewRequests").doc(`${id}_revision_${reviewRevision}`), { tournamentId: id, hostId: user.uid, status: "pending_review", revision: reviewRevision, createdAt: now });
        transaction.create(db.collection("tournamentAuditEvents").doc(`${id}_submitted_${reviewRevision}`), { tournamentId: id, actorId: user.uid, action: "submitted_for_review", createdAt: now, metadata: { status: "pending_review", revision: reviewRevision } });
        transaction.set(db.collection("notifications").doc(`${id}_submitted_${reviewRevision}`), { userId: user.uid, type: "tournament_submitted", title: "Tournament submitted for review", body: "Your challenge has been submitted for review.", targetId: id, actionUrl: challengeReviewBuilderDestination(tournament as unknown as Record<string, unknown>, id, "tournaments"), read: false, delivery: { inApp: true, email: false }, createdAt: now });
        transaction.set(db.collection("tournamentEmailOutbox").doc(`${id}_submitted_${reviewRevision}`), { tournamentId: id, userId: user.uid, category: "challengeReminders", title: "Tournament submitted for review", message: "Your challenge has been submitted for review.", status: "pending", createdAt: now });
      }
    });
  } catch (error) {
    if (error instanceof Error && "code" in error && typeof error.code === "string") return fail(error.message, 409, undefined, error.code);
    throw error;
  }
  return ok({ tournament: { ...tournament, ...update } }, transitionToReview ? "Your challenge has been submitted for review." : "Tournament foundation updated. No bracket, participants, payments, winners, or payouts were created.");
}
