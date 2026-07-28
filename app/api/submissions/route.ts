import { getAdminDb } from "@/lib/firebase/admin";
import { canAccessChallenge } from "@/lib/plan-access";
import { requireRequestUser } from "@/lib/server/auth";
import { writeAuditLog } from "@/lib/server/audit";
import { challengeForPlanAccess, userOwnsChallenge } from "@/lib/server/challenge-access";
import { createNotification } from "@/lib/server/notifications";
import { ok, serverUnavailable, fail, readJson, validationError, conflict, serverError } from "@/lib/server/responses";
import {
  isChallengeSubmittable,
  isEnteredParticipantStatus,
  isSponsorProfile,
  resolveSubmissionStatus
} from "@/lib/server/submission-lifecycle";
import { submissionCreateSchema, zodFieldErrors } from "@/lib/server/submission-validation";
import { isPaidEntryChallenge } from "@/lib/server/monetization-payments";
import { submissionFolderForMediaType, submissionMediaPath } from "@/lib/media-upload-paths";

function initialsFromName(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  return (parts[0]?.[0] ?? "?") + (parts[1]?.[0] ?? "?");
}

export async function POST(request: Request) {
  const { user, response } = await requireRequestUser(request);
  if (response) return response;
  const db = getAdminDb();
  if (!db) return serverUnavailable("Submission creation");

  const parsed = await readJson(request);
  if (parsed.response) return parsed.response;
  const parsedSubmission = submissionCreateSchema.safeParse(parsed.body ?? {});
  if (!parsedSubmission.success) return validationError(zodFieldErrors(parsedSubmission.error));
  const body = parsedSubmission.data;

  const [accountSnap, profileSnap] = await Promise.all([
    db.collection("users").doc(user.uid).get(),
    db.collection("profiles").doc(user.uid).get()
  ]);
  const profile = { ...(profileSnap.exists ? profileSnap.data() ?? {} : {}), ...(accountSnap.exists ? accountSnap.data() ?? {} : {}) } as Record<string, unknown>;
  if (isSponsorProfile(profile)) {
    return fail("Sponsor accounts use sponsor tools and cannot submit entries into normal user challenges.", 403, undefined, "SPONSOR_ACCOUNT_BLOCKED");
  }

  const challengeSnap = await db.collection("challenges").doc(body.challengeId).get();
  if (!challengeSnap.exists) return fail("Challenge not found.", 404, { fieldErrors: { challengeId: "Challenge does not exist." } }, "NOT_FOUND");
  const challenge = { id: challengeSnap.id, ...challengeSnap.data() } as Record<string, unknown>;
  if (userOwnsChallenge(challenge, user.uid)) return fail("Creators and hosts cannot submit entries to their own challenge.", 403, undefined, "SELF_ENTRY_NOT_ALLOWED");
  const accessContext = await challengeForPlanAccess(db, challenge, user.uid);
  if (accessContext.privateOnly && !accessContext.hasAccessGrant) {
    return fail("A valid private challenge invite or approval is required.", 403, { redirectTo: "/private-exclusive" }, "PRIVATE_INVITE_REQUIRED");
  }
  const access = canAccessChallenge(profile, accessContext.challenge);
  if (!access.allowed) {
    return fail("Your current plan does not allow access to this challenge.", 403, undefined, access.code ?? "CHALLENGE_ACCESS_DENIED");
  }
  const submittable = isChallengeSubmittable(challenge);
  if (!submittable.allowed) {
    return fail(submittable.reason ?? "Challenge is not accepting submissions.", 409, undefined, "CHALLENGE_NOT_SUBMITTABLE");
  }

  const acceptedTypes = Array.isArray(challenge.acceptedSubmissionTypes) ? challenge.acceptedSubmissionTypes.map(String) : ["image"];
  if (!acceptedTypes.includes(body.mediaType)) {
    return validationError({ mediaType: `This challenge accepts: ${acceptedTypes.join(", ")}.` });
  }
  const expectedSubmissionPrefix = submissionMediaPath(body.challengeId, user.uid, submissionFolderForMediaType(body.mediaType)) + "/";
  if (!body.mediaStoragePath.startsWith(expectedSubmissionPrefix)) {
    return validationError({ mediaStoragePath: "Submission media must be uploaded to your authenticated challenge submission path." });
  }

  const now = new Date().toISOString();
  const allowMultipleEntries = challenge.allowMultipleEntries === true;
  const submissionRef = allowMultipleEntries ? db.collection("submissions").doc() : db.collection("submissions").doc(`${body.challengeId}_${user.uid}`);
  const participantRef = db.collection("challengeParticipants").doc(`${body.challengeId}_${user.uid}`);
  const displayName = String(profile.displayName ?? profile.fullName ?? user.email ?? "Participant");
  const userInitials = String(profile.initials ?? initialsFromName(displayName)).slice(0, 2).toUpperCase();
  const status = resolveSubmissionStatus(challenge, body.mediaUploadPending);
  const duplicateBlockingStatuses = new Set(["draft", "submitted", "pending_review", "approved", "flagged", "active", "eliminated", "winner"]);

  let submission: Record<string, unknown> = {};
  let submissionCreated = false;
  let participantWasCreated = false;
  try {
    await db.runTransaction(async (transaction) => {
      const userSubmissionsQuery = db.collection("submissions").where("userId", "==", user.uid).limit(100);
      const [freshChallengeSnap, participantSnap, directSubmissionSnap, userSubmissionsSnap] = await Promise.all([
        transaction.get(db.collection("challenges").doc(body.challengeId)),
        transaction.get(participantRef),
        transaction.get(submissionRef),
        transaction.get(userSubmissionsQuery)
      ]);
      if (!freshChallengeSnap.exists) throw new Error("Challenge not found.");
      const freshChallenge = { id: freshChallengeSnap.id, ...freshChallengeSnap.data() } as Record<string, unknown>;
      const freshSubmittable = isChallengeSubmittable(freshChallenge);
      if (!freshSubmittable.allowed) throw new Error(freshSubmittable.reason ?? "Challenge is not accepting submissions.");

      if (!allowMultipleEntries) {
        if (directSubmissionSnap.exists) throw new Error("DUPLICATE_SUBMISSION");
        const existing = userSubmissionsSnap.docs.find((doc) => {
          const entry = doc.data();
          return entry.challengeId === body.challengeId && duplicateBlockingStatuses.has(String(entry.status ?? ""));
        });
        if (existing) throw new Error("DUPLICATE_SUBMISSION");
      }

      const participantData = participantSnap.exists ? participantSnap.data() ?? {} : null;
      if (!participantData) {
        throw new Error("NOT_ENROLLED_FOR_SUBMISSION");
      }
      if (isPaidEntryChallenge(freshChallenge) && !["paid", "confirmed"].includes(String(participantData?.entryPaymentStatus ?? ""))) {
        throw new Error("PAID_ENTRY_PAYMENT_REQUIRED");
      }
      participantWasCreated = false;
      transaction.set(participantRef, {
        entryAgreementAccepted: true,
        entryAgreementAcceptedAt: participantData.entryAgreementAcceptedAt ?? now,
        updatedAt: now
      }, { merge: true });

      submission = {
        id: submissionRef.id,
        challengeId: body.challengeId,
        participantId: participantRef.id,
        userId: user.uid,
        title: body.title,
        description: body.description || body.caption || "",
        caption: body.caption || body.description || "",
        mediaUrl: body.mediaUrl ?? "",
        mediaType: body.mediaType,
        status,
        mediaUploadPending: body.mediaUploadPending,
        originalFileName: body.originalFileName ?? "",
        fileSize: Number(body.fileSize ?? 0),
        mediaStoragePath: body.mediaStoragePath ?? "",
        voteCount: 0,
        weightedVoteCount: 0,
        challengeTitle: String(freshChallenge.title ?? "Untitled Challenge"),
        challengeCategory: String(freshChallenge.category ?? "General"),
        userDisplayName: displayName,
        userName: displayName,
        userInitials,
        userPlanId: profile.planId ?? "free",
        entryAgreementAccepted: true,
        entryAgreementAcceptedAt: now,
        rulesAccepted: true,
        paidEntryEnabled: false,
        entryFeeCents: 0,
        visibility: "public",
        submittedAt: now,
        reviewedAt: null,
        reviewedBy: null,
        rejectionReason: null,
        createdAt: now,
        updatedAt: now
      };

      submissionCreated = true;
      transaction.set(submissionRef, submission);
      transaction.set(participantRef, {
        submissionId: submissionRef.id,
        lastSubmissionId: submissionRef.id,
        status: participantData.status ?? "active",
        updatedAt: now
      }, { merge: true });
      transaction.set(db.collection("challenges").doc(body.challengeId), {
        submissionCount: Number(freshChallenge.submissionCount ?? 0) + 1,
        participantCount: Number(freshChallenge.participantCount ?? 0) + (participantWasCreated ? 1 : 0),
        updatedAt: now
      }, { merge: true });
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Submission could not be created.";
    if (message.includes("already submitted")) return conflict(message);
    if (message === "PAID_ENTRY_PAYMENT_REQUIRED") return fail("Entry fee required. Pay the entry fee before submitting your entry.", 402, { action: "pay_entry_fee", checkoutUrl: `/api/challenges/${body.challengeId}/entry-checkout`, challengePath: `/challenges/${body.challengeId}` }, "PAID_ENTRY_PAYMENT_REQUIRED");
    if (message === "NOT_ENROLLED_FOR_SUBMISSION") return fail("Join this challenge during registration before submitting your entry.", 403, { action: "join_challenge", challengePath: `/challenges/${body.challengeId}/join` }, "NOT_ENROLLED_FOR_SUBMISSION");
    if (message === "DUPLICATE_SUBMISSION") return fail("You have already submitted an entry for this challenge.", 409, { action: "view_entry", challengePath: `/challenges/${body.challengeId}` }, "DUPLICATE_SUBMISSION");
    return fail(message, message === "Challenge not found." ? 404 : 409, undefined, message === "Challenge not found." ? "NOT_FOUND" : "SUBMISSION_REJECTED");
  }

  if (!submissionCreated) return serverError("Submission could not be created.");

  void writeAuditLog({
    actorId: user.uid,
    actorType: "user",
    action: "submission.created",
    targetType: "submission",
    targetId: String(submission.id),
    after: submission,
    metadata: { challengeId: body.challengeId, status, participantWasCreated }
  }, db).catch((error) => console.warn("[audit] submission create audit failed", { challengeId: body.challengeId, userId: user.uid, error: error instanceof Error ? error.message : "unknown" }));

  await createNotification(db, {
    userId: user.uid,
    type: "submission_uploaded",
    title: body.mediaUploadPending ? "Submission received" : "Submission uploaded",
    body: status === "pending_review" ? "Your submission is pending review." : status === "submitted" ? "Your submission metadata was saved and media upload is pending." : "Your submission is live.",
    targetId: String(submission.id)
  });
  return ok({ submission }, status === "pending_review" ? "Submission uploaded and pending review." : status === "submitted" ? "Submission received. Media processing is pending." : "Submission uploaded successfully.");
}


