import { getAdminDb } from "@/lib/firebase/admin";
import { requireRequestUser } from "@/lib/server/auth";
import { fail, ok, readJson, serverUnavailable } from "@/lib/server/responses";
import { writeAuditLog } from "@/lib/server/audit";
import { calculateChallengeDraftProgress, editableDraftStatus, resolveChallengeManagementState } from "@/lib/server/challenge-drafts";
import { userOwnsChallenge } from "@/lib/server/challenge-access";
import { normalizeChallengeTimelineForStorage } from "@/lib/challenge-date-time";
import { isRetiredHybridCompetition, retiredHybridCompetitionState } from "@/lib/server/retired-competitions";
import { inferLegacyMaxUnlockedStep, normalizeBuilderChallengeType } from "@/lib/challenge-builder-foundation";
import { getNormalChallengeReadiness } from "@/lib/normal-challenge-readiness";
import { NORMAL_CHALLENGE_MAX_STEP } from "@/lib/normal-challenge-config";

const allowedDraftFields = new Set([
  "title", "shortDescription", "description", "category", "subcategory", "customCategory", "type", "challengeType", "builderVersion", "coverMediaType", "visibility", "premiumOnly",
  "acceptedSubmissionTypes", "competitionFormat", "bestOf", "startsAt", "endsAt", "submissionStartAt", "submissionDeadline",
  "registrationDeadline", "votingDeadline", "votingStartsAt", "votingEndsAt", "winnerAnnouncementAt", "timeZone", "timezone", "lateRegistrationEnabled",
  "standardRules", "challengeRules", "policyTerms", "challengeGuidelines", "coverImageUrl", "coverImagePath", "promoImageUrl",
  "promoImagePath", "trailerVideoUrl", "trailerVideoPath", "promoVideoUrl", "promoVideoPath", "documentUrls",
  "documentPaths", "challengeImages", "challengeVideo", "mediaUploadStatus", "mediaStatus", "usesPlaceholderMedia", "mediaFallbackType", "prizeType",
  "prizeTitle", "prizeDescription", "prizeValue", "numberOfWinners", "winnerPrizeAmountsCents", "winnerSelection", "inviteCode", "accessCode", "privateAccessMethod", "privateAccessCode", "privateAccessCodeExpiresAt", "privateAccessCodeMaxUses", "privateAccessInstructions", "privateParticipantQuestions", "privateParticipantAcknowledgements",
  "votingSettings", "requiresSubmissionApproval", "requiresParticipantApproval", "participantApprovalMode", "participationMode", "locationEligibility", "eligibleCountries", "ageRestrictionMode", "capacityMode", "maxParticipants", "hideParticipantList", "waitlistEnabled", "eligibleCountry", "minimumAge", "maximumAge", "teamParticipationEnabled",
  "sponsorEnabled", "sponsorSlots", "minimumSponsorshipAmount", "sponsorPlacementOptions", "sponsorPackages",
  "monetization", "isLiveEvent", "venueName", "eventAddress", "eventCity", "eventState", "eventCountry",
  "eventMapUrl", "eventCapacity", "externalLiveUrl", "externalLiveProvider", "externalLiveStatus", "externalLiveOpensAt",
  "externalLiveCtaLabel", "tournamentType", "tournamentStages", "divisionFormat", "scoringMode", "bestOfRounds",
  "pointsToWin", "timerEnabled", "timerDuration", "roundDuration", "judgeScoringEnabled", "hostOperations", "creationStep", "builderCurrentStep", "maxUnlockedStep", "joinWindowMode", "submissionRequirements", "submissionRequirementsList", "fixAndResubmitEnabled", "fixAndResubmitHours", "oneEntryPerParticipant", "hideVoteTotals", "hideRankings", "winnerSplits", "prizeCurrency", "registrationEnabled", "registrationOpensAt", "publishConfirmations"
]);

const allowedMonetizationFields = new Set(["enabled", "paidEntryRequested", "entryFeeAmountCents", "currency", "sponsorReady", "prizePoolRequested", "paidVotesRequested", "sponsorshipGoal", "preferredSponsorCategory", "sponsorNote", "placements", "status", "paymentActive", "checkoutActive", "ledgerCreationEnabled", "prizeReleaseActive", "payoutReleaseActive"]);

function sanitizeDraftPatch(body: Record<string, unknown>) {
  const patch: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(body)) {
    if (!allowedDraftFields.has(key)) continue;
    if (key === "monetization" && value && typeof value === "object") {
      patch[key] = Object.fromEntries(Object.entries(value as Record<string, unknown>).filter(([field]) => allowedMonetizationFields.has(field)));
    } else patch[key] = value;
  }
  if (patch.participantApprovalMode && !["automatic", "manual"].includes(String(patch.participantApprovalMode))) delete patch.participantApprovalMode;
  if (patch.maxParticipants !== undefined) patch.maxParticipants = Math.max(0, Math.trunc(Number(patch.maxParticipants) || 0));
  if (patch.creationStep !== undefined) patch.creationStep = Math.max(0, Math.trunc(Number(patch.creationStep) || 0));
  if (patch.builderCurrentStep !== undefined) patch.builderCurrentStep = Math.max(0, Math.min(NORMAL_CHALLENGE_MAX_STEP, Math.trunc(Number(patch.builderCurrentStep) || 0)));
  if (patch.maxUnlockedStep !== undefined) patch.maxUnlockedStep = Math.max(0, Math.min(NORMAL_CHALLENGE_MAX_STEP, Math.trunc(Number(patch.maxUnlockedStep) || 0)));
  return patch;
}

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { user, response } = await requireRequestUser(request);
  if (response) return response;
  const db = getAdminDb();
  if (!db) return serverUnavailable("Challenge draft");
  const { id } = await params;
  const snap = await db.collection("challenges").doc(id).get();
  if (!snap.exists) return fail("Challenge draft not found.", 404, undefined, "CHALLENGE_NOT_FOUND");
  const challenge = { id: snap.id, ...snap.data() } as Record<string, unknown>;
  if (!userOwnsChallenge(challenge, user.uid)) return fail("You can only edit your own challenge drafts.", 403, undefined, "PERMISSION_DENIED");
  const progress = calculateChallengeDraftProgress(challenge);
  return ok({ challenge: { ...challenge, ...(retiredHybridCompetitionState(challenge) ?? {}), managementState: resolveChallengeManagementState(challenge), completionPercentage: Number(challenge.completionPercentage ?? progress.completionPercentage), nextIncompleteSection: challenge.nextIncompleteSection ?? progress.nextIncompleteSection } }, "Challenge draft loaded.");
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { user, response } = await requireRequestUser(request);
  if (response) return response;
  const db = getAdminDb();
  if (!db) return serverUnavailable("Challenge draft autosave");
  const parsed = await readJson(request);
  if (parsed.response) return parsed.response;
  const body = (parsed.body ?? {}) as Record<string, unknown>;
  const patch = sanitizeDraftPatch(body);
  const { id } = await params;
  const ref = db.collection("challenges").doc(id);
  const now = new Date().toISOString();
  let updated: Record<string, unknown>;
  try {
    updated = await db.runTransaction(async (transaction) => {
    const snap = await transaction.get(ref);
    if (!snap.exists) throw new Error("CHALLENGE_NOT_FOUND");
    const current = { id: snap.id, ...snap.data() } as Record<string, unknown>;
    if (!userOwnsChallenge(current, user.uid)) throw new Error("PERMISSION_DENIED");
    const lockedType = normalizeBuilderChallengeType(current.challengeType ?? current.type);
    const usesNormalBuilderFoundation = lockedType === "normal" && (
      ["normal_v1", "normal_v2"].includes(String(current.builderVersion ?? "")) || String(current.challengeType ?? "") === "normal"
    );
    if (patch.challengeType !== undefined && normalizeBuilderChallengeType(patch.challengeType) !== lockedType) throw new Error("CHALLENGE_TYPE_LOCKED");
    if (patch.type !== undefined && normalizeBuilderChallengeType(patch.type) !== lockedType) throw new Error("CHALLENGE_TYPE_LOCKED");
    if (body.ownershipType !== undefined && body.ownershipType !== current.ownershipType) throw new Error("CHALLENGE_OWNERSHIP_LOCKED");
    if (body.officialChallenge !== undefined && Boolean(body.officialChallenge) !== Boolean(current.officialChallenge)) throw new Error("CHALLENGE_OWNERSHIP_LOCKED");
    if (isRetiredHybridCompetition(current) || isRetiredHybridCompetition({ ...current, ...patch })) {
      return { ...current, ...calculateChallengeDraftProgress(current), retiredCompetition: true, archived: true };
    }
    if (!editableDraftStatus(current)) throw new Error("CHALLENGE_NOT_EDITABLE");
    const normalizedPatch = normalizeChallengeTimelineForStorage(patch, current);
    if (normalizedPatch.monetization && typeof normalizedPatch.monetization === "object") {
      const currentMonetization = current.monetization && typeof current.monetization === "object" ? current.monetization as Record<string, unknown> : {};
      normalizedPatch.monetization = { ...currentMonetization, ...normalizedPatch.monetization as Record<string, unknown> };
    }
    const merged = { ...current, ...normalizedPatch, updatedAt: now, lastAutosavedAt: now };
    const currentUnlocked = inferLegacyMaxUnlockedStep(current);
    const requestedStep = Number(normalizedPatch.builderCurrentStep ?? normalizedPatch.creationStep ?? current.builderCurrentStep ?? current.creationStep ?? 1);
    const requestedUnlocked = Number(normalizedPatch.maxUnlockedStep ?? currentUnlocked);
    if (usesNormalBuilderFoundation && (requestedStep > currentUnlocked + 1 || requestedUnlocked > currentUnlocked + 1)) throw new Error("FUTURE_STEP_LOCKED");
    const normalReadiness = usesNormalBuilderFoundation ? getNormalChallengeReadiness(merged) : null;
    if (normalReadiness && requestedStep === currentUnlocked + 1) {
      if (!normalReadiness.steps[currentUnlocked]?.complete) throw new Error("CURRENT_STEP_INCOMPLETE");
    }
    const progress = calculateChallengeDraftProgress(merged);
    const firstInvalidStep = normalReadiness ? normalReadiness.steps.findIndex((item) => !item.complete) : -1;
    const requestedBoundary = Math.max(currentUnlocked, Math.min(currentUnlocked + 1, requestedUnlocked, requestedStep));
    const safeUnlockedStep = firstInvalidStep >= 0 ? Math.min(requestedBoundary, firstInvalidStep) : requestedBoundary;
    const finalPatch = { ...normalizedPatch, challengeType: lockedType, challengeTypeLocked: true, maxUnlockedStep: safeUnlockedStep, completionPercentage: progress.completionPercentage, nextIncompleteSection: progress.nextIncompleteSection, updatedAt: now, lastAutosavedAt: now, draftAutosaveEnabled: true };
    transaction.set(ref, finalPatch, { merge: true });
    return { ...merged, ...progress, retiredCompetition: false, archived: false };
    });
  } catch (error) {
    const code = error instanceof Error ? error.message : "";
    if (code === "CHALLENGE_NOT_FOUND") return fail("Challenge draft not found.", 404, undefined, code);
    if (code === "PERMISSION_DENIED") return fail("You can only edit your own challenge drafts.", 403, undefined, code);
    if (code === "CHALLENGE_TYPE_LOCKED") return fail("Challenge type can't be changed after the draft is created.", 409, undefined, code);
    if (code === "CHALLENGE_OWNERSHIP_LOCKED") return fail("Challenge ownership can't be changed after the draft is created.", 409, undefined, code);
    if (code === "FUTURE_STEP_LOCKED" || code === "CURRENT_STEP_INCOMPLETE") return fail("Complete this step before continuing.", 422, { nextRequiredStep: inferLegacyMaxUnlockedStep(body) }, code);
    if (code === "CHALLENGE_NOT_EDITABLE") return fail("This challenge can no longer be edited.", 409, undefined, code);
    throw error;
  }
  if ("retiredCompetition" in updated && updated.retiredCompetition === true) {
    return fail("Hybrid Competition has been discontinued. Historical records remain available in read-only mode.", 410, { archived: true, preserveHistoricalRecords: true }, "HYBRID_COMPETITION_RETIRED");
  }
  await writeAuditLog({ actorId: user.uid, actorType: "user", action: "challenge.draft_updated", targetType: "challenge", targetId: id, after: { completionPercentage: updated.completionPercentage, nextIncompleteSection: updated.nextIncompleteSection }, metadata: { source: "api/challenges/drafts/[id]", autosave: true } }, db).catch(() => undefined);
  return ok({ challenge: updated }, "Challenge draft saved.");
}

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { user, response } = await requireRequestUser(request);
  if (response) return response;
  const db = getAdminDb();
  if (!db) return serverUnavailable("Challenge draft deletion");
  const { id } = await params;
  const ref = db.collection("challenges").doc(id);
  const now = new Date().toISOString();
  await db.runTransaction(async (transaction) => {
    const snap = await transaction.get(ref);
    if (!snap.exists) throw new Error("CHALLENGE_NOT_FOUND");
    const challenge = { id: snap.id, ...snap.data() } as Record<string, unknown>;
    if (!userOwnsChallenge(challenge, user.uid)) throw new Error("PERMISSION_DENIED");
    if (!editableDraftStatus(challenge)) throw new Error("CHALLENGE_NOT_EDITABLE");
    const hasActivity = [challenge.participantCount, challenge.submissionCount, challenge.confirmedPaymentCount, challenge.paymentCount].some((value) => Number(value ?? 0) > 0);
    transaction.set(ref, hasActivity
      ? { status: "cancelled", lifecycleStatus: "cancelled", cancellationReason: "Creator cancelled a draft with recorded activity.", cancelledAt: now, cancelledBy: user.uid, draftDeleted: false, updatedAt: now }
      : { status: "cancelled", lifecycleStatus: "cancelled", deletedAt: now, deletedBy: user.uid, draftDeleted: true, updatedAt: now }, { merge: true });
  });
  await writeAuditLog({ actorId: user.uid, actorType: "user", action: "challenge.draft_deleted", targetType: "challenge", targetId: id, metadata: { softDelete: true } }, db).catch(() => undefined);
  return ok({ id, status: "cancelled" }, "Draft deleted.");
}
