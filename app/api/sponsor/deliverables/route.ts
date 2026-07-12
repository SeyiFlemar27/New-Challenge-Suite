import { ok, readJson, serverError, validationError } from "@/lib/server/responses";
import { requireSponsorContext } from "@/lib/server/sponsor";
import { cleanText, isoNow, normalizeDeliverableStatus, safeArray } from "@/lib/sponsor-collaboration";

export const dynamic = "force-dynamic";

function deliverablePayload(body: Record<string, unknown>, sponsorId: string, now: string, existing: Record<string, unknown> = {}) {
  return { sponsorId, ownerUid: sponsorId, title: cleanText(body.title ?? body.name ?? existing.title, "Sponsor deliverable").slice(0, 180), description: cleanText(body.description ?? existing.description).slice(0, 1200), relatedCampaignId: cleanText(body.campaignId ?? body.relatedCampaignId ?? existing.relatedCampaignId).slice(0, 120) || null, relatedProposalId: cleanText(body.proposalId ?? body.relatedProposalId ?? existing.relatedProposalId).slice(0, 120) || null, relatedCreatorId: cleanText(body.creatorId ?? body.relatedCreatorId ?? existing.relatedCreatorId).slice(0, 120) || null, ownerCreatorFoundation: cleanText(body.ownerCreatorFoundation ?? existing.ownerCreatorFoundation).slice(0, 180), dueDate: cleanText(body.dueDate ?? existing.dueDate).slice(0, 40), status: normalizeDeliverableStatus(body.status ?? existing.status), uploadedFiles: safeArray(body.uploadedFiles ?? existing.uploadedFiles), revisionNumber: Number(body.revisionNumber ?? existing.revisionNumber ?? 1), sponsorFeedback: cleanText(body.sponsorFeedback ?? existing.sponsorFeedback).slice(0, 1600), nextAction: cleanText(body.nextAction ?? existing.nextAction, "Awaiting sponsor review foundation").slice(0, 240), paymentReleaseStatus: "not_active", updatedAt: now, updatedBy: sponsorId, version: Number(existing.version ?? 0) + 1 };
}

export async function GET(request: Request) {
  const { context, response } = await requireSponsorContext(request);
  if (response) return response;
  if (!context) return serverError("Sponsor access could not be verified.");
  const url = new URL(request.url);
  const campaignId = url.searchParams.get("campaignId");
  try {
    let query: FirebaseFirestore.Query = context.db.collection("sponsorDeliverables").where("sponsorId", "==", context.user.uid);
    if (campaignId) query = query.where("relatedCampaignId", "==", campaignId);
    const snap = await query.limit(100).get();
    const deliverables = snap.docs.map((doc) => ({ id: doc.id, ...doc.data() })).sort((a, b) => String((b as any).updatedAt ?? "").localeCompare(String((a as any).updatedAt ?? "")));
    return ok({ deliverables }, "Sponsor deliverables loaded.");
  } catch (error) {
    console.error("[sponsor-deliverables:get]", { userId: context.user.uid, message: error instanceof Error ? error.message : String(error) });
    return serverError("Deliverables could not be loaded.");
  }
}

export async function POST(request: Request) {
  const { context, response } = await requireSponsorContext(request);
  if (response) return response;
  if (!context) return serverError("Sponsor access could not be verified.");
  const parsed = await readJson(request);
  if (parsed.response) return parsed.response;
  const body = parsed.body && typeof parsed.body === "object" ? parsed.body as Record<string, unknown> : {};
  if (cleanText(body.title ?? body.name).length < 3) return validationError({ title: "Deliverable title is required." });
  try {
    const now = isoNow();
    const ref = context.db.collection("sponsorDeliverables").doc();
    const deliverable = { id: ref.id, ...deliverablePayload(body, context.user.uid, now), createdAt: now, createdBy: context.user.uid };
    await Promise.all([ref.set(deliverable), context.db.collection("sponsorDeliverableRevisions").add({ sponsorId: context.user.uid, deliverableId: ref.id, revisionNumber: deliverable.revisionNumber, status: deliverable.status, feedback: deliverable.sponsorFeedback, createdAt: now, createdBy: context.user.uid })]);
    return ok({ deliverable }, "Deliverable saved. Approval does not release payment.");
  } catch (error) {
    console.error("[sponsor-deliverables:post]", { userId: context.user.uid, message: error instanceof Error ? error.message : String(error) });
    return serverError("Deliverable could not be saved.");
  }
}
