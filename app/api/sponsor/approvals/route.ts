import { ok, readJson, serverError, validationError } from "@/lib/server/responses";
import { requireSponsorContext } from "@/lib/server/sponsor";
import { cleanText, isoNow, normalizeApprovalStatus, safeArray } from "@/lib/sponsor-collaboration";

export const dynamic = "force-dynamic";

function approvalPayload(body: Record<string, unknown>, sponsorId: string, now: string, existing: Record<string, unknown> = {}) {
  return { sponsorId, ownerUid: sponsorId, title: cleanText(body.title ?? existing.title, "Approval item").slice(0, 180), type: cleanText(body.type ?? existing.type, "campaign_asset").slice(0, 120), status: normalizeApprovalStatus(body.status ?? existing.status), previewFoundation: cleanText(body.previewFoundation ?? existing.previewFoundation).slice(0, 500), relatedCampaignId: cleanText(body.campaignId ?? body.relatedCampaignId ?? existing.relatedCampaignId).slice(0, 120) || null, relatedProposalId: cleanText(body.proposalId ?? body.relatedProposalId ?? existing.relatedProposalId).slice(0, 120) || null, relatedCreatorId: cleanText(body.creatorId ?? body.relatedCreatorId ?? existing.relatedCreatorId).slice(0, 120) || null, submittedFiles: safeArray(body.submittedFiles ?? existing.submittedFiles), deadline: cleanText(body.deadline ?? existing.deadline).slice(0, 40), revisionCount: Number(body.revisionCount ?? existing.revisionCount ?? 0), commentsCountFoundation: Number(existing.commentsCountFoundation ?? 0), feedback: cleanText(body.feedback ?? existing.feedback).slice(0, 1600), paymentReleaseStatus: "not_active", publishStatus: "not_automatic", contractStatus: "not_active", updatedAt: now, updatedBy: sponsorId, version: Number(existing.version ?? 0) + 1 };
}

export async function GET(request: Request) {
  const { context, response } = await requireSponsorContext(request);
  if (response) return response;
  if (!context) return serverError("Sponsor access could not be verified.");
  try {
    const snap = await context.db.collection("sponsorApprovals").where("sponsorId", "==", context.user.uid).limit(100).get();
    const approvals = snap.docs.map((doc) => ({ id: doc.id, ...doc.data() })).sort((a, b) => String((b as any).updatedAt ?? "").localeCompare(String((a as any).updatedAt ?? "")));
    return ok({ approvals }, "Sponsor approvals loaded.");
  } catch (error) {
    console.error("[sponsor-approvals:get]", { userId: context.user.uid, message: error instanceof Error ? error.message : String(error) });
    return serverError("Approvals could not be loaded.");
  }
}

export async function POST(request: Request) {
  const { context, response } = await requireSponsorContext(request);
  if (response) return response;
  if (!context) return serverError("Sponsor access could not be verified.");
  const parsed = await readJson(request);
  if (parsed.response) return parsed.response;
  const body = parsed.body && typeof parsed.body === "object" ? parsed.body as Record<string, unknown> : {};
  if (cleanText(body.title).length < 3) return validationError({ title: "Approval title is required." });
  try {
    const now = isoNow();
    const ref = context.db.collection("sponsorApprovals").doc();
    const approval = { id: ref.id, ...approvalPayload(body, context.user.uid, now), createdAt: now, createdBy: context.user.uid };
    await Promise.all([ref.set(approval), context.db.collection("sponsorApprovalActivity").add({ sponsorId: context.user.uid, approvalId: ref.id, action: "approval_created", status: approval.status, createdAt: now, createdBy: context.user.uid })]);
    return ok({ approval }, "Approval item saved. No payment, contract, or publish action was triggered.");
  } catch (error) {
    console.error("[sponsor-approvals:post]", { userId: context.user.uid, message: error instanceof Error ? error.message : String(error) });
    return serverError("Approval item could not be saved.");
  }
}
