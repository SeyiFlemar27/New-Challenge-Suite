import { z } from "zod";
import { zodFieldErrors } from "@/lib/server/challenge-validation";
import { getAdminDb } from "@/lib/firebase/admin";
import { requireRequestUser } from "@/lib/server/auth";
import { canEditTournament } from "@/lib/server/tournament-permissions";
import { fail, ok, readJson, serverUnavailable, validationError } from "@/lib/server/responses";
import { freezeTournamentBuilderMedia, verifyTournamentBuilderMedia } from "@/lib/server/tournament-media-verification";
const schema = z.object({ title: z.string().trim().min(1).max(120).optional(), description: z.string().trim().min(1).max(1200).optional(), coverImageUrl: z.string().max(2000).optional(), coverImagePath: z.string().max(500).optional(), trailerUrl: z.string().max(2000).optional(), trailerPath: z.string().max(500).optional(), expectedUpdatedAt: z.string(), reason: z.string().max(1000).default("Creator updated promotional details.") }).strict();
export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  const auth = await requireRequestUser(request); if (auth.response) return auth.response;
  const db = getAdminDb(); if (!db) return serverUnavailable("Tournament editing");
  const parsed = await readJson(request); if (parsed.response) return parsed.response;
  const body = schema.safeParse(parsed.body); if (!body.success) return validationError(zodFieldErrors(body.error));
  const { id } = await context.params, ref = db.collection("tournaments").doc(id), snap = await ref.get(), record = snap.data();
  if (!record) return fail("Tournament not found.", 404);
  if (!canEditTournament({ ...auth.user }, record).allowed) return fail("Permission denied.", 403);
  const { expectedUpdatedAt, reason, ...patch } = body.data;
  if (!Object.keys(patch).length) return fail("Select a descriptive or promotional change.", 422);
  let verification: Awaited<ReturnType<typeof freezeTournamentBuilderMedia>> | undefined;
  if (patch.coverImagePath || patch.trailerPath) {
    try { verification = await freezeTournamentBuilderMedia(id, await verifyTournamentBuilderMedia({ ...record, ...patch, id }, String(record.hostId))); }
    catch { return fail("Replacement media could not be verified. Published content is preserved.", 422, undefined, "MEDIA_VERIFICATION_REQUIRED"); }
  } else if (patch.coverImageUrl || patch.trailerUrl) return fail("Upload replacement media with its storage path.", 422);
  try {
    const update = await db.runTransaction(async tx => {
      const current = await tx.get(ref), data = current.data();
      if (!data || !canEditTournament({ ...auth.user }, data).allowed || !data.publishedAt || data.updatedAt !== expectedUpdatedAt || ["held", "suspended", "removed"].includes(String(data.moderationStatus))) throw new Error("TOURNAMENT_STATE_CHANGED");
      const now = new Date().toISOString(), update = { ...patch, ...(verification ? { creatorMediaVerification: verification, coverMedia: { ...data.coverMedia, path: verification.cover.path, url: verification.cover.url }, coverImagePath: verification.cover.path, coverImageUrl: verification.cover.url, ...(verification.trailer ? { trailerMedia: verification.trailer, trailerPath: verification.trailer.path, trailerUrl: verification.trailer.url } : {}) } : {}), updatedAt: now };
      tx.update(ref, update); tx.create(db.collection("tournamentAuditEvents").doc(), { tournamentId: id, actorId: auth.user.uid, action: "tournament.promotional_details_updated", reason, changedFields: Object.keys(patch), createdAt: now });
      return update;
    });
    return ok(update, "Published Tournament details updated.");
  } catch { return fail("This Tournament changed. Refresh before retrying.", 409, undefined, "TOURNAMENT_STATE_CHANGED"); }
}
