import { assertSponsorOwnedDoc, requireSponsorContext, requireSponsorPermission } from "@/lib/server/sponsor";
import { fail, ok, readJson, serverError } from "@/lib/server/responses";
import { cleanText, isoNow, normalizeDeliverableStatus, safeArray } from "@/lib/sponsor-collaboration";
import { createNotification } from "@/lib/server/notifications";

export const dynamic = "force-dynamic";

export async function GET(request: Request, { params }: { params: Promise<{ deliverableId: string }> }) {
  const { context, response } = await requireSponsorContext(request);
  if (response) return response;
  if (!context) return serverError("Sponsor access could not be verified.");
  const permissionError = requireSponsorPermission(context, "deliverable.view");
  if (permissionError) return permissionError;
  try {
    const { deliverableId } = await params;
    const owned = await assertSponsorOwnedDoc(context.db, "sponsorDeliverables", deliverableId, context.sponsorId);
    if (owned.response) return owned.response;
    const snap = await context.db.collection("sponsorDeliverableRevisions").where("deliverableId", "==", deliverableId).where("sponsorId", "==", context.sponsorId).limit(50).get();
    const revisions = snap.docs.map((doc) => ({ id: doc.id, ...doc.data() } as Record<string, unknown> & { id: string })).sort((a, b) => String(a.createdAt ?? "").localeCompare(String(b.createdAt ?? "")));
    return ok({ deliverable: { id: owned.snap.id, ...owned.snap.data() }, revisions }, "Deliverable loaded.");
  } catch (error) {
    console.error("[sponsor-deliverable:get]", { userId: context.user.uid, message: error instanceof Error ? error.message : String(error) });
    return serverError("Deliverable could not be loaded.");
  }
}

export async function PATCH(request: Request, { params }: { params: Promise<{ deliverableId: string }> }) {
  const { context, response } = await requireSponsorContext(request);
  if (response) return response;
  if (!context) return serverError("Sponsor access could not be verified.");
  const permissionError = requireSponsorPermission(context, "deliverable.manage");
  if (permissionError) return permissionError;
  const parsed = await readJson(request);
  if (parsed.response) return parsed.response;
  const body = parsed.body && typeof parsed.body === "object" ? parsed.body as Record<string, unknown> : {};
  try {
    const { deliverableId } = await params;
    const now = isoNow();
    let updated: Record<string, unknown> | null = null;
    await context.db.runTransaction(async (transaction) => {
      const ref = context.db.collection("sponsorDeliverables").doc(deliverableId);
      const fresh = await transaction.get(ref);
      const existing = fresh.data() ?? {};
      if (!fresh.exists || existing.sponsorId !== context.sponsorId) throw new Error("NOT_FOUND");
      const expectedVersion = Number(body.expectedVersion ?? existing.version ?? 1);
      if (Number(existing.version ?? 1) !== expectedVersion) throw new Error("VERSION_CONFLICT");
      const status = normalizeDeliverableStatus(body.status ?? existing.status);
      if (!["under_review", "approved", "changes_requested"].includes(status)) throw new Error("INVALID_STATUS");
      if (status === "changes_requested" && cleanText(body.sponsorFeedback).length < 3) throw new Error("FEEDBACK_REQUIRED");
      const patch = { title: cleanText(body.title ?? existing.title, "Sponsor deliverable").slice(0, 180), status, sponsorFeedback: cleanText(body.sponsorFeedback ?? existing.sponsorFeedback).slice(0, 1600), uploadedFiles: body.uploadedFiles === undefined ? Array.isArray(existing.uploadedFiles) ? existing.uploadedFiles : [] : safeArray(body.uploadedFiles), revisionNumber: Number(body.revisionNumber ?? existing.revisionNumber ?? 1), nextAction: status === "approved" ? "Approval recorded. Payment release is handled separately after funding and contract setup." : status === "changes_requested" ? "Creator revision requested." : cleanText(body.nextAction ?? existing.nextAction).slice(0, 240), paymentReleaseStatus: "not_active", updatedAt: now, updatedBy: context.user.uid, version: expectedVersion + 1 };
      transaction.set(ref, patch, { merge: true });
      const revisionRef = context.db.collection("sponsorDeliverableRevisions").doc(`${deliverableId}_v${patch.version}`);
      transaction.create(revisionRef, { id: revisionRef.id, sponsorId: context.sponsorId, sponsorOrganizationId: context.organizationId, deliverableId, version: patch.version, revisionNumber: patch.revisionNumber, status, feedback: patch.sponsorFeedback, createdAt: now, createdBy: context.user.uid });
      updated = { id: deliverableId, ...existing, ...patch };
    });
    const saved = updated as Record<string, unknown> | null;
    const creatorId = String(saved?.relatedCreatorId ?? "");
    if (creatorId && ["approved", "changes_requested"].includes(String(saved?.status ?? ""))) {
      await createNotification(context.db, { userId: creatorId, type: String(saved?.status) === "approved" ? "sponsor_deliverable_approved" : "sponsor_deliverable_changes_requested", title: String(saved?.status) === "approved" ? "Sponsorship deliverable approved" : "Sponsorship deliverable needs changes", body: String(saved?.status) === "approved" ? "Your deliverable was approved." : cleanText(saved?.sponsorFeedback, "Review the requested changes and resubmit."), entityType: "sponsor_deliverable", entityId: deliverableId, actionUrl: `/creator/sponsorships?focus=${encodeURIComponent(deliverableId)}`, idempotencyKey: `sponsor_deliverable_${deliverableId}_${String(saved?.version)}` }).catch(() => undefined);
    }
    return ok({ deliverable: updated }, "Deliverable updated. No payment release was triggered.");
  } catch (error) {
    if (error instanceof Error && error.message === "NOT_FOUND") return fail("Deliverable not found.", 404, undefined, "NOT_FOUND");
    if (error instanceof Error && error.message === "VERSION_CONFLICT") return fail("This deliverable changed. Refresh before saving again.", 409, undefined, "DELIVERABLE_VERSION_CONFLICT");
    if (error instanceof Error && error.message === "FEEDBACK_REQUIRED") return fail("Add a short explanation of the requested changes.", 400, undefined, "DELIVERABLE_FEEDBACK_REQUIRED");
    if (error instanceof Error && error.message === "INVALID_STATUS") return fail("Choose an available review action.", 422, undefined, "DELIVERABLE_ACTION_NOT_ALLOWED");
    console.error("[sponsor-deliverable:patch]", { userId: context.user.uid, message: error instanceof Error ? error.message : String(error) });
    return serverError("Deliverable could not be updated.");
  }
}
