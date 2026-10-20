import { z } from "zod";
import { requireChallengeManagementAccess } from "@/lib/server/challenge-management-access";
import { fail, ok, readJson, validationError } from "@/lib/server/responses";
import { verifyChallengeMedia, applyVerifiedChallengeMedia } from "@/lib/server/media-verification";
import { PROMOTIONAL_EDIT_FIELDS } from "@/lib/publishing-policy";
import { zodFieldErrors } from "@/lib/server/challenge-validation";
import { userOwnsChallenge } from "@/lib/server/challenge-access";
const media = z.object({ id: z.string().max(120), url: z.string().max(2000), path: z.string().max(500), size: z.number().nonnegative(), fileName: z.string().max(240).optional(), contentType: z.string().max(120).optional() });
const schema = z.object({
  title: z.string().trim().min(1).max(120).optional(), description: z.string().trim().min(1).max(1200).optional(), shortDescription: z.string().trim().max(240).optional(),
  coverImageUrl: z.string().max(2000).optional(), coverImagePath: z.string().max(500).optional(),
  promoImageUrl: z.string().max(2000).optional(), promoImagePath: z.string().max(500).optional(),
  trailerVideoUrl: z.string().max(2000).optional(), trailerVideoPath: z.string().max(500).optional(),
  promoVideoUrl: z.string().max(2000).optional(), promoVideoPath: z.string().max(500).optional(),
  challengeImages: z.array(media).min(1).max(3).optional(), challengeVideo: media.nullable().optional(),
  reason: z.string().trim().max(1000).default("Creator updated promotional details."), expectedUpdatedAt: z.string()
}).strict();
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params, access = await requireChallengeManagementAccess(request, id, "challenge.edit");
  if (access.response || !access.user || !access.db || !access.challenge) return access.response;
  const parsed = await readJson(request); if (parsed.response) return parsed.response;
  const body = schema.safeParse(parsed.body); if (!body.success) return validationError(zodFieldErrors(body.error));
  const patch = Object.fromEntries(Object.entries(body.data).filter(([key]) => (PROMOTIONAL_EDIT_FIELDS as readonly string[]).includes(key)));
  if (!Object.keys(patch).length) return fail("Select a descriptive or promotional change.", 422);
  let verification: Awaited<ReturnType<typeof verifyChallengeMedia>> | undefined;
  if (Object.keys(patch).some(key => /Path$|Images$|Video$/.test(key))) {
    try { verification = await verifyChallengeMedia(access.db, id, { ...access.challenge, ...patch }, String(access.challenge.creatorId ?? access.challenge.hostId)); applyVerifiedChallengeMedia(patch, verification); }
    catch { return fail("The replacement media could not be verified. Your published content is preserved.", 422, undefined, "MEDIA_VERIFICATION_REQUIRED"); }
  } else if (Object.keys(patch).some(key => /Url$/.test(key))) return fail("Upload replacement media and include its storage path.", 422, undefined, "MEDIA_STORAGE_PATH_REQUIRED");
  try {
    const update = await access.db.runTransaction(async transaction => {
      const ref = access.db!.collection("challenges").doc(id), snap = await transaction.get(ref), challenge = snap.data() ?? {};
      if (!snap.exists || !challenge.publishedAt || ["draft", "pending_review", "changes_requested", "deleted", "cancelled"].includes(String(challenge.status)) || ["held", "suspended", "removed"].includes(String(challenge.moderationStatus))) throw new Error("PUBLISHED_CHALLENGE_REQUIRED");
      if (!userOwnsChallenge(challenge, access.user!.uid) && !access.user!.isAdmin && !access.enterpriseAccess) throw new Error("PERMISSION_DENIED");
      if (challenge.updatedAt !== body.data.expectedUpdatedAt) throw new Error("CHALLENGE_STATE_CHANGED");
      const now = new Date().toISOString(), next = { ...patch, contentRevision: Number(challenge.contentRevision ?? 0) + 1, updatedAt: now };
      transaction.update(ref, next);
      if (verification) transaction.set(access.db!.collection("challengeMediaVerifications").doc(id), verification);
      if (challenge.isLiveEvent) transaction.set(access.db!.collection("liveEvents").doc(id), next, { merge: true });
      transaction.create(access.db!.collection("auditLogs").doc(), { actorId: access.user!.uid, action: "challenge.published_details_updated", challengeId: id, changedFields: Object.keys(patch), reason: body.data.reason, createdAt: now });
      return next;
    });
    return ok(update, "Published details updated.");
  } catch { return fail("This challenge changed or is not eligible for this edit. Refresh before retrying.", 409, undefined, "CHALLENGE_STATE_CHANGED"); }
}
