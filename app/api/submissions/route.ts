import { getAdminDb } from "@/lib/firebase/admin";
import { requireRequestUser } from "@/lib/server/auth";
import { createNotification } from "@/lib/server/notifications";
import { ok, serverUnavailable, fail, readJson, validationError } from "@/lib/server/responses";

export async function POST(request: Request) {
  const { user, response } = await requireRequestUser(request);
  if (response) return response;
  const db = getAdminDb();
  if (!db) return serverUnavailable("Submission creation");
  const parsed = await readJson(request);
  if (parsed.response) return parsed.response;
  const body = parsed.body;
  const fieldErrors: Record<string, string> = {};
  if (!body?.challengeId) fieldErrors.challengeId = "Challenge ID is required.";
  if (!body?.title) fieldErrors.title = "Title is required.";
  if (!body?.mediaUrl) fieldErrors.mediaUrl = "Media URL is required.";
  if (body?.mediaType && !["image", "video"].includes(body.mediaType)) fieldErrors.mediaType = "Media type must be image or video.";
  if (Object.keys(fieldErrors).length) return validationError(fieldErrors);

  const challengeSnap = await db.collection("challenges").doc(body.challengeId).get();
  if (!challengeSnap.exists) return fail("Challenge not found.", 404, { fieldErrors: { challengeId: "Challenge does not exist." } }, "NOT_FOUND");
  const challenge = challengeSnap.data() ?? {};
  const mediaType = body.mediaType ?? "image";
  const acceptedTypes = Array.isArray(challenge.acceptedSubmissionTypes) ? challenge.acceptedSubmissionTypes : ["image"];
  if (!acceptedTypes.includes(mediaType)) {
    return validationError({ mediaType: `This challenge accepts: ${acceptedTypes.join(", ")}.` });
  }

  const now = new Date().toISOString();
  const ref = db.collection("submissions").doc();
  const submission = {
    id: ref.id,
    challengeId: body.challengeId,
    userId: user.uid,
    title: body.title,
    description: body.description ?? "",
    caption: body.caption ?? "",
    mediaUrl: body.mediaUrl,
    mediaType,
    status: "pending_approval",
    voteCount: 0,
    weightedVoteCount: 0,
    createdAt: now,
    updatedAt: now
  };
  await db.runTransaction(async (transaction) => {
    transaction.set(ref, submission);
    const challengeRef = db.collection("challenges").doc(body.challengeId);
    const freshChallengeSnap = await transaction.get(challengeRef);
    transaction.set(challengeRef, { submissionCount: Number(freshChallengeSnap.data()?.submissionCount ?? 0) + 1, updatedAt: now }, { merge: true });
  });
  await createNotification(db, { userId: user.uid, type: "submission_uploaded", title: "Submission uploaded", body: "Your submission is pending approval.", targetId: ref.id });
  return ok({ submission }, "Submission uploaded and pending approval.");
}
