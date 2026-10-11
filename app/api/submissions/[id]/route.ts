import { getAdminDb } from "@/lib/firebase/admin";
import { fail, ok, serverError, serverUnavailable } from "@/lib/server/responses";
import { buildChallengeLeaderboard } from "@/lib/server/leaderboard";
import { toPublicProfile } from "@/lib/server/public-profile";
import { getOptionalRequestUser } from "@/lib/server/auth";
import { isPublicChallenge, isPublicSubmission, publicChallengeFields, publicSubmissionFields } from "@/lib/server/public-challenge";
import { getAdminStorage } from "@/lib/firebase/admin";
import { requireRequestUser } from "@/lib/server/auth";
import { challengeForPlanAccess, userOwnsChallenge } from "@/lib/server/challenge-access";
import { canAccessChallenge } from "@/lib/plan-access";
import { getSubmissionDeadline, isChallengeSubmittable, isEnteredParticipantStatus, isSponsorProfile } from "@/lib/server/submission-lifecycle";
import { submissionUpdateSchema, zodFieldErrors } from "@/lib/server/submission-validation";
import { submissionFolderForMediaType, submissionMediaPath } from "@/lib/media-upload-paths";
import { validateOwnedStorageMedia } from "@/lib/server/media-storage-validation";
import { isPaidEntryChallenge } from "@/lib/server/monetization-payments";

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const auth = await requireRequestUser(request);
  if (auth.response || !auth.user) return auth.response;
  const db = getAdminDb();
  const storage = getAdminStorage();
  if (!db || !storage) return serverUnavailable("Submission update");
  let raw: unknown;
  try { raw = await request.json(); } catch { return fail("Request body must be valid JSON.", 400, undefined, "INVALID_JSON"); }
  const parsed = submissionUpdateSchema.safeParse(raw);
  if (!parsed.success) return fail("Submission details are invalid.", 400, { fieldErrors: zodFieldErrors(parsed.error) }, "VALIDATION_ERROR");
  const body = parsed.data;
  const submissionRef = db.collection("submissions").doc(id);
  const initialSubmissionSnap = await submissionRef.get();
  if (!initialSubmissionSnap.exists) return fail("Submission not found.", 404, undefined, "NOT_FOUND");
  const initial = initialSubmissionSnap.data() ?? {};
  if (String(initial.userId ?? "") !== auth.user.uid) return fail("Only the submission owner can edit this entry.", 403, undefined, "PERMISSION_DENIED");
  const challengeId = String(initial.challengeId ?? "");
  const [challengeSnap, accountSnap, profileSnap] = await Promise.all([
    db.collection("challenges").doc(challengeId).get(),
    db.collection("users").doc(auth.user.uid).get(),
    db.collection("profiles").doc(auth.user.uid).get()
  ]);
  if (!challengeSnap.exists) return fail("Challenge not found.", 404, undefined, "CHALLENGE_NOT_FOUND");
  const challenge = { id: challengeSnap.id, ...challengeSnap.data() } as Record<string, unknown>;
  const profile = { ...(profileSnap.data() ?? {}), ...(accountSnap.data() ?? {}) } as Record<string, unknown>;
  if (isSponsorProfile(profile) || userOwnsChallenge(challenge, auth.user.uid)) return fail("This account cannot edit this submission.", 403, undefined, "SUBMISSION_EDIT_FORBIDDEN");
  const accessContext = await challengeForPlanAccess(db, challenge, auth.user.uid);
  if (accessContext.privateOnly && !accessContext.hasAccessGrant) return fail("A valid private challenge invite or approval is required.", 403, undefined, "PRIVATE_INVITE_REQUIRED");
  const planAccess = canAccessChallenge(profile, accessContext.challenge);
  if (!planAccess.allowed) return fail("Your current plan does not allow access to this challenge.", 403, undefined, planAccess.code ?? "CHALLENGE_ACCESS_DENIED");
  const acceptedTypes = Array.isArray(challenge.acceptedSubmissionTypes) ? challenge.acceptedSubmissionTypes.map(String) : ["image"];
  if (!acceptedTypes.includes(body.mediaType)) return fail("This challenge does not accept that media type.", 400, undefined, "MEDIA_TYPE_NOT_ACCEPTED");
  const now = new Date();
  const deadlineValue = getSubmissionDeadline(challenge);
  const deadlineMs = Date.parse(String(deadlineValue ?? ""));
  if (!Number.isFinite(deadlineMs) || now.getTime() >= deadlineMs || !isChallengeSubmittable(challenge, now).allowed) {
    return fail("Submission edits are locked at or after the submission deadline.", 409, undefined, "SUBMISSION_EDIT_WINDOW_CLOSED");
  }
  const lockedStatuses = new Set(["flagged", "disqualified", "withdrawn", "eliminated", "winner"]);
  if (lockedStatuses.has(String(initial.status ?? "").toLowerCase())) return fail("This submission is locked by its current review or result status.", 409, undefined, "SUBMISSION_MODERATION_LOCKED");
  const expectedPrefix = submissionMediaPath(challengeId, auth.user.uid, submissionFolderForMediaType(body.mediaType)) + "/";
  if (!body.mediaStoragePath.startsWith(expectedPrefix)) return fail("Submission media must belong to your authenticated challenge submission folder.", 400, undefined, "INVALID_MEDIA_STORAGE_PATH");
  const ownedMedia = validateOwnedStorageMedia({ url: body.mediaUrl, path: body.mediaStoragePath, prefixes: [expectedPrefix] });
  if (!ownedMedia.valid) return fail(ownedMedia.message, 400, undefined, ownedMedia.code);
  try {
    const file = storage.bucket().file(body.mediaStoragePath);
    const [exists] = await file.exists();
    if (!exists) return fail("The replacement media file was not found in Storage.", 400, undefined, "SUBMISSION_MEDIA_MISSING");
    const [metadata] = await file.getMetadata();
    const contentType = String(metadata.contentType ?? "").toLowerCase();
    const size = Number(metadata.size ?? 0);
    const allowed = body.mediaType === "image" ? ["image/jpeg", "image/png", "image/webp"] : ["video/mp4", "video/avi", "video/x-msvideo"];
    if (!allowed.includes(contentType) || size !== body.fileSize || !Number.isSafeInteger(size) || size <= 0 || size > (body.mediaType === "image" ? 15 : 250) * 1024 * 1024) {
      return fail("The replacement media metadata does not match the accepted format or size.", 400, undefined, "SUBMISSION_MEDIA_INVALID");
    }
  } catch (error) {
    console.error("[api/submissions/:id] media verification failed", { submissionId: id, code: error instanceof Error ? error.name : "unknown" });
    return serverUnavailable("Submission media verification");
  }
  const participantRef = db.collection("challengeParticipants").doc(`${challengeId}_${auth.user.uid}`);
  const challengeRef = db.collection("challenges").doc(challengeId);
  const expectedRevision = body.expectedRevision ?? Number(initial.revisionNumber ?? 0);
  const nowIso = now.toISOString();
  try {
    const updated = await db.runTransaction(async (transaction) => {
      const [submissionSnap, freshChallengeSnap, participantSnap] = await Promise.all([
        transaction.get(submissionRef), transaction.get(challengeRef), transaction.get(participantRef)
      ]);
      if (!submissionSnap.exists || !freshChallengeSnap.exists) throw new Error("SUBMISSION_OR_CHALLENGE_MISSING");
      const current = submissionSnap.data() ?? {};
      const freshChallenge = { id: freshChallengeSnap.id, ...freshChallengeSnap.data() } as Record<string, unknown>;
      const participant = participantSnap.data() ?? {};
      if (String(current.userId ?? "") !== auth.user!.uid || String(current.challengeId ?? "") !== challengeId) throw new Error("SUBMISSION_OWNER_OR_CHALLENGE_CHANGED");
      if (Number(current.revisionNumber ?? 0) !== expectedRevision) throw new Error("SUBMISSION_REVISION_CONFLICT");
      const freshDeadline = Date.parse(String(getSubmissionDeadline(freshChallenge) ?? ""));
      if (!Number.isFinite(freshDeadline) || Date.now() >= freshDeadline || !isChallengeSubmittable(freshChallenge, new Date()).allowed) throw new Error("SUBMISSION_EDIT_WINDOW_CLOSED");
      if (!participantSnap.exists || !isEnteredParticipantStatus(participant.status)) throw new Error("PARTICIPANT_NOT_ELIGIBLE");
      if (isPaidEntryChallenge(freshChallenge) && !["paid", "confirmed"].includes(String(participant.entryPaymentStatus ?? ""))) throw new Error("PAID_ENTRY_PAYMENT_REQUIRED");
      if (lockedStatuses.has(String(current.status ?? "").toLowerCase())) throw new Error("SUBMISSION_MODERATION_LOCKED");
      const revisionNumber = Number(current.revisionNumber ?? 0) + 1;
      const next = { ...current, title: body.title, description: body.description || body.caption || "", caption: body.caption || body.description || "", mediaUrl: body.mediaUrl, mediaType: body.mediaType, mediaStoragePath: body.mediaStoragePath, originalFileName: body.originalFileName, fileSize: body.fileSize, revisionNumber, revisedAt: nowIso, updatedAt: nowIso, mediaUploadPending: false };
      const revisionRef = db.collection("submissionRevisions").doc(`${id}_v${revisionNumber}`);
      transaction.create(revisionRef, { id: revisionRef.id, submissionId: id, challengeId, userId: auth.user!.uid, revisionNumber, before: { title: current.title ?? "", description: current.description ?? "", mediaUrl: current.mediaUrl ?? "", mediaType: current.mediaType ?? "", mediaStoragePath: current.mediaStoragePath ?? "" }, after: { title: next.title, description: next.description, mediaUrl: next.mediaUrl, mediaType: next.mediaType, mediaStoragePath: next.mediaStoragePath }, priorModerationStatus: current.status ?? null, priorReviewReason: current.rejectionReason ?? null, createdAt: nowIso, createdBy: auth.user!.uid, immutable: true });
      transaction.set(submissionRef, next, { merge: true });
      return next;
    });
    return ok({ submission: { id, ...updated } }, "Submission updated successfully.");
  } catch (error) {
    const code = error instanceof Error ? error.message : "SUBMISSION_UPDATE_FAILED";
    if (code === "SUBMISSION_REVISION_CONFLICT") return fail("This submission changed in another request. Reload it before editing again.", 409, undefined, code);
    if (code === "SUBMISSION_EDIT_WINDOW_CLOSED") return fail("Submission edits are locked at or after the submission deadline.", 409, undefined, code);
    if (code === "SUBMISSION_MODERATION_LOCKED") return fail("This submission is locked by its current review or result status.", 409, undefined, code);
    if (code === "PARTICIPANT_NOT_ELIGIBLE") return fail("An active participant record is required to edit this submission.", 403, undefined, code);
    if (code === "PAID_ENTRY_PAYMENT_REQUIRED") return fail("The paid entry must be confirmed before this submission can be edited.", 402, undefined, code);
    return serverError("Submission could not be updated.");
  }
}

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const db = getAdminDb();
  if (!db) return serverUnavailable("Submission details");

  try {
    const submissionSnap = await db.collection("submissions").doc(id).get();
    if (!submissionSnap.exists) {
      return fail("Submission not found.", 404, { fieldErrors: { id: "Submission does not exist." } }, "NOT_FOUND");
    }

    const submission = { id: submissionSnap.id, ...submissionSnap.data() } as Record<string, unknown>;
    const challengeId = String(submission.challengeId ?? "");
    const userId = String(submission.userId ?? "");
    const [challengeSnap, profileSnap, leaderboard] = await Promise.all([
      challengeId ? db.collection("challenges").doc(challengeId).get() : Promise.resolve(null),
      userId ? db.collection("profiles").doc(userId).get() : Promise.resolve(null),
      challengeId ? buildChallengeLeaderboard(db, challengeId, { limit: 200 }) : Promise.resolve(null)
    ]);

    const challengeData = challengeSnap?.exists ? challengeSnap.data() ?? {} : null;
    const user = await getOptionalRequestUser(request);
    const publicAccess = Boolean(
      challengeSnap?.exists
      && challengeData
      && isPublicChallenge(challengeSnap.id, challengeData)
      && isPublicSubmission(submissionSnap.id, submission)
    );
    const ownerAccess = Boolean(user && (user.uid === userId || user.uid === String(challengeData?.creatorId ?? "")));
    if (!publicAccess && !ownerAccess) {
      return fail("Submission not found.", 404, undefined, "NOT_FOUND");
    }

    const challenge = challengeSnap?.exists && challengeData
      ? { id: challengeSnap.id, ...publicChallengeFields(challengeData, challengeSnap.id) }
      : null;
    const creator = profileSnap?.exists ? toPublicProfile(profileSnap.id, profileSnap.data() ?? {}) : null;
    const rank = leaderboard?.entries.find((item) => item.submissionId === id || item.id === id)?.rank ?? null;

    return ok({
      submission: {
        id: submissionSnap.id,
        ...publicSubmissionFields(submission),
        ...(ownerAccess ? { editableMedia: { mediaStoragePath: submission.mediaStoragePath ?? "", fileSize: submission.fileSize ?? 0, originalFileName: submission.originalFileName ?? "", revisionNumber: submission.revisionNumber ?? 0 } } : {})
      },
      challenge,
      creator,
      participant: null,
      rank,
      leaderboard: leaderboard ? { status: leaderboard.status, visibilityMode: leaderboard.visibilityMode, visible: leaderboard.visible, message: leaderboard.message } : null,
      comments: []
    }, "Submission details loaded.");
  } catch (error) {
    console.error("[api/submissions/:id] detail query failed", {
      submissionId: id,
      error: error instanceof Error ? error.message : "unknown"
    });
    return serverError("Submission details could not be loaded.");
  }
}
