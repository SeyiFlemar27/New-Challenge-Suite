import { getAdminDb } from "@/lib/firebase/admin";
import { requireRequestUser } from "@/lib/server/auth";
import { createNotification } from "@/lib/server/notifications";
import { listSponsorOrganizationMemberUserIds } from "@/lib/server/sponsor-organizations";
import { fail, ok, readJson, serverError, serverUnavailable } from "@/lib/server/responses";
import { cleanText, isoNow, safeArray } from "@/lib/sponsor-collaboration";

export const dynamic = "force-dynamic";

export async function PATCH(request: Request, { params }: { params: Promise<{ deliverableId: string }> }) {
  const auth = await requireRequestUser(request);
  if (auth.response) return auth.response;
  const db = getAdminDb();
  if (!db) return serverUnavailable("Creator sponsorship deliverable");
  const parsed = await readJson(request);
  if (parsed.response) return parsed.response;
  const body = parsed.body && typeof parsed.body === "object" ? parsed.body as Record<string, unknown> : {};
  const { deliverableId } = await params;
  try {
    let updated: Record<string, unknown> | null = null;
    await db.runTransaction(async (transaction) => {
      const ref = db.collection("sponsorDeliverables").doc(deliverableId);
      const snap = await transaction.get(ref);
      const existing = snap.data() ?? {};
      if (!snap.exists || existing.relatedCreatorId !== auth.user.uid) throw new Error("NOT_FOUND");
      if (!["not_started", "in_progress", "changes_requested"].includes(String(existing.status ?? "not_started"))) throw new Error("ACTION_NOT_ALLOWED");
      const expectedVersion = Number(body.expectedVersion ?? 0);
      if (Number(existing.version ?? 1) !== expectedVersion) throw new Error("VERSION_CONFLICT");
      const uploadedFiles = safeArray(body.uploadedFiles);
      const submissionNote = cleanText(body.submissionNote).slice(0, 1600);
      if (!uploadedFiles.length && submissionNote.length < 3) throw new Error("SUBMISSION_REQUIRED");
      const now = isoNow();
      const version = expectedVersion + 1;
      const revisionNumber = Number(existing.revisionNumber ?? 1) + 1;
      const patch = { status: "submitted", uploadedFiles, creatorSubmissionNote: submissionNote, sponsorFeedback: "", revisionNumber, version, submittedAt: now, updatedAt: now, updatedBy: auth.user.uid };
      transaction.update(ref, patch);
      transaction.create(db.collection("sponsorDeliverableRevisions").doc(`${deliverableId}_v${version}`), { id: `${deliverableId}_v${version}`, sponsorId: existing.sponsorId, sponsorOrganizationId: existing.sponsorOrganizationId ?? existing.sponsorId, deliverableId, relatedSponsorshipId: existing.relatedSponsorshipId ?? null, version, revisionNumber, status: "submitted", uploadedFiles, creatorSubmissionNote: submissionNote, createdAt: now, createdBy: auth.user.uid, immutable: true });
      updated = { id: deliverableId, ...existing, ...patch };
    });
    const saved = updated as Record<string, unknown> | null;
    const organizationId = String(saved?.sponsorOrganizationId ?? saved?.sponsorId ?? "");
    if (organizationId) {
      const memberUserIds = await listSponsorOrganizationMemberUserIds(db, organizationId);
      await Promise.all(memberUserIds.map((userId) => createNotification(db, { userId, type: "sponsor_deliverable_submitted", title: "Sponsorship deliverable submitted", body: String(saved?.title ?? "A sponsorship deliverable") + " is ready for review.", entityType: "sponsor_deliverable", entityId: deliverableId, actionUrl: `/sponsor/deliverables/${deliverableId}`, idempotencyKey: `sponsor_deliverable_submitted_${deliverableId}_${String(saved?.version)}_${userId}` }).catch(() => undefined)));
    }
    return ok({ deliverable: updated }, "Deliverable submitted for sponsor review.");
  } catch (error) {
    if (error instanceof Error && error.message === "NOT_FOUND") return fail("Deliverable not found.", 404, undefined, "NOT_FOUND");
    if (error instanceof Error && error.message === "VERSION_CONFLICT") return fail("This deliverable changed. Refresh before submitting again.", 409, undefined, "DELIVERABLE_VERSION_CONFLICT");
    if (error instanceof Error && error.message === "ACTION_NOT_ALLOWED") return fail("This deliverable is not available for submission right now.", 422, undefined, "DELIVERABLE_ACTION_NOT_ALLOWED");
    if (error instanceof Error && error.message === "SUBMISSION_REQUIRED") return fail("Add a submission note or at least one confirmed file reference.", 400, undefined, "DELIVERABLE_SUBMISSION_REQUIRED");
    console.error("[creator-sponsorship-deliverable:patch]", { userId: auth.user.uid, deliverableId, message: error instanceof Error ? error.message : String(error) });
    return serverError("Deliverable could not be submitted.");
  }
}
