import { getAdminDb } from "@/lib/firebase/admin";
import { requireRequestUser } from "@/lib/server/auth";
import { fail, ok, readJson, serverUnavailable } from "@/lib/server/responses";
import { writeAuditLog } from "@/lib/server/audit";
import { calculateChallengeDraftProgress, editableDraftStatus, resolveChallengeManagementState } from "@/lib/server/challenge-drafts";
import { userOwnsChallenge } from "@/lib/server/challenge-access";

const allowedDraftFields = new Set([
  "title", "description", "category", "customCategory", "type", "visibility", "premiumOnly",
  "acceptedSubmissionTypes", "competitionFormat", "bestOf", "startsAt", "endsAt", "submissionStartAt", "submissionDeadline",
  "registrationDeadline", "votingDeadline", "votingStartsAt", "votingEndsAt", "timeZone", "lateRegistrationEnabled",
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

function sanitizeDraftPatch(body: Record<string, unknown>) {
  const patch: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(body)) {
    if (allowedDraftFields.has(key)) patch[key] = value;
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
  return ok({ challenge: { ...challenge, managementState: resolveChallengeManagementState(challenge), completionPercentage: Number(challenge.completionPercentage ?? progress.completionPercentage), nextIncompleteSection: challenge.nextIncompleteSection ?? progress.nextIncompleteSection } }, "Challenge draft loaded.");
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
    if (!editableDraftStatus(current)) throw new Error("CHALLENGE_NOT_EDITABLE");
    const merged = { ...current, ...patch, updatedAt: now, lastAutosavedAt: now };
    const progress = calculateChallengeDraftProgress(merged);
    const finalPatch = { ...patch, completionPercentage: progress.completionPercentage, nextIncompleteSection: progress.nextIncompleteSection, updatedAt: now, lastAutosavedAt: now, draftAutosaveEnabled: true };
    transaction.set(ref, finalPatch, { merge: true });
    return { ...merged, ...progress };
  });
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
