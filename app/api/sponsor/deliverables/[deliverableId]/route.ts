import { assertSponsorOwnedDoc, requireSponsorContext } from "@/lib/server/sponsor";
import { ok, readJson, serverError } from "@/lib/server/responses";
import { cleanText, isoNow, normalizeDeliverableStatus, safeArray } from "@/lib/sponsor-collaboration";

export const dynamic = "force-dynamic";

export async function GET(request: Request, { params }: { params: Promise<{ deliverableId: string }> }) {
  const { context, response } = await requireSponsorContext(request);
  if (response) return response;
  if (!context) return serverError("Sponsor access could not be verified.");
  try {
    const { deliverableId } = await params;
    const owned = await assertSponsorOwnedDoc(context.db, "sponsorDeliverables", deliverableId, context.user.uid);
    if (owned.response) return owned.response;
    const snap = await context.db.collection("sponsorDeliverableRevisions").where("deliverableId", "==", deliverableId).where("sponsorId", "==", context.user.uid).limit(50).get();
    const revisions = snap.docs.map((doc) => ({ id: doc.id, ...doc.data() })).sort((a, b) => String((a as any).createdAt ?? "").localeCompare(String((b as any).createdAt ?? "")));
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
  const parsed = await readJson(request);
  if (parsed.response) return parsed.response;
  const body = parsed.body && typeof parsed.body === "object" ? parsed.body as Record<string, unknown> : {};
  try {
    const { deliverableId } = await params;
    const owned = await assertSponsorOwnedDoc(context.db, "sponsorDeliverables", deliverableId, context.user.uid);
    if (owned.response) return owned.response;
    const existing = owned.snap.data() ?? {};
    const now = isoNow();
    const status = normalizeDeliverableStatus(body.status ?? existing.status);
    const patch = { title: cleanText(body.title ?? existing.title, "Sponsor deliverable").slice(0, 180), status, sponsorFeedback: cleanText(body.sponsorFeedback ?? existing.sponsorFeedback).slice(0, 1600), uploadedFiles: body.uploadedFiles === undefined ? Array.isArray(existing.uploadedFiles) ? existing.uploadedFiles : [] : safeArray(body.uploadedFiles), revisionNumber: Number(body.revisionNumber ?? existing.revisionNumber ?? 1), nextAction: status === "approved" ? "Approval recorded. Payment release is handled separately after funding and contract setup." : status === "changes_requested" ? "Creator revision requested." : cleanText(body.nextAction ?? existing.nextAction).slice(0, 240), paymentReleaseStatus: "not_active", updatedAt: now, updatedBy: context.user.uid, version: Number(existing.version ?? 0) + 1 };
    await Promise.all([context.db.collection("sponsorDeliverables").doc(deliverableId).set(patch, { merge: true }), context.db.collection("sponsorDeliverableRevisions").add({ sponsorId: context.user.uid, deliverableId, revisionNumber: patch.revisionNumber, status, feedback: patch.sponsorFeedback, createdAt: now, createdBy: context.user.uid })]);
    return ok({ deliverable: { id: deliverableId, ...existing, ...patch } }, "Deliverable updated. No payment release was triggered.");
  } catch (error) {
    console.error("[sponsor-deliverable:patch]", { userId: context.user.uid, message: error instanceof Error ? error.message : String(error) });
    return serverError("Deliverable could not be updated.");
  }
}
