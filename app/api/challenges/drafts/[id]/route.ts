import { getAdminDb } from "@/lib/firebase/admin";
import { requireRequestUser } from "@/lib/server/auth";
import { fail, ok, readJson, serverUnavailable } from "@/lib/server/responses";
import { writeAuditLog } from "@/lib/server/audit";
import { calculateChallengeDraftProgress, editableDraftStatus, resolveChallengeManagementState } from "@/lib/server/challenge-drafts";
import { userOwnsChallenge } from "@/lib/server/challenge-access";
import { normalizeChallengeTimelineForStorage } from "@/lib/challenge-date-time";
import { isRetiredHybridCompetition, retiredHybridCompetitionState } from "@/lib/server/retired-competitions";

const allowedDraftFields = new Set([
  "title", "description", "category", "customCategory", "type", "visibility", "premiumOnly",
  "acceptedSubmissionTypes", "competitionFormat", "bestOf", "startsAt", "endsAt", "submissionStartAt", "submissionDeadline",
  "registrationDeadline", "votingDeadline", "votingStartsAt", "votingEndsAt", "winnerAnnouncementAt", "timeZone", "timezone", "lateRegistrationEnabled",
  "standardRules", "policyTerms", "challengeGuidelines", "coverImageUrl", "coverImagePath", "promoImageUrl",
  "promoImagePath", "trailerVideoUrl", "trailerVideoPath", "promoVideoUrl", "promoVideoPath", "documentUrls",
  "documentPaths", "mediaUploadStatus", "mediaStatus", "usesPlaceholderMedia", "mediaFallbackType", "prizeType",
  "prizeTitle", "prizeDescription", "prizeValue", "numberOfWinners", "winnerSelection", "inviteCode", "accessCode",
  "votingSettings", "requiresSubmissionApproval", "requiresParticipantApproval", "participantApprovalMode", "maxParticipants",
  "sponsorEnabled", "sponsorSlots", "minimumSponsorshipAmount", "sponsorPlacementOptions", "sponsorPackages",
  "monetization", "isLiveEvent", "venueName", "eventAddress", "eventCity", "eventState", "eventCountry",
  "eventMapUrl", "eventCapacity", "externalLiveUrl", "externalLiveProvider", "externalLiveStatus", "externalLiveOpensAt",
  "externalLiveCtaLabel", "tournamentType", "tournamentStages", "divisionFormat", "scoringMode", "bestOfRounds",
  "pointsToWin", "timerEnabled", "timerDuration", "roundDuration", "judgeScoringEnabled", "hostOperations", "creationStep"
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
  const updated = await db.runTransaction(async (transaction) => {
    const snap = await transaction.get(ref);
    if (!snap.exists) throw new Error("CHALLENGE_NOT_FOUND");
    const current = { id: snap.id, ...snap.data() } as Record<string, unknown>;
    if (!userOwnsChallenge(current, user.uid)) throw new Error("PERMISSION_DENIED");
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
    const progress = calculateChallengeDraftProgress(merged);
    const finalPatch = { ...normalizedPatch, completionPercentage: progress.completionPercentage, nextIncompleteSection: progress.nextIncompleteSection, updatedAt: now, lastAutosavedAt: now, draftAutosaveEnabled: true };
    transaction.set(ref, finalPatch, { merge: true });
    return { ...merged, ...progress, retiredCompetition: false, archived: false };
  });
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
    transaction.set(ref, { status: "cancelled", lifecycleStatus: "cancelled", deletedAt: now, deletedBy: user.uid, draftDeleted: true, updatedAt: now }, { merge: true });
  });
  await writeAuditLog({ actorId: user.uid, actorType: "user", action: "challenge.draft_deleted", targetType: "challenge", targetId: id, metadata: { softDelete: true } }, db).catch(() => undefined);
  return ok({ id, status: "cancelled" }, "Draft deleted.");
}
