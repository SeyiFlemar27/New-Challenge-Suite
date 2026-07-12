import { ok, readJson, serverError, validationError } from "@/lib/server/responses";
import { requireSponsorContext } from "@/lib/server/sponsor";
import { cleanMoneyCents, cleanText, isoNow, normalizeContractStatus, safeArray } from "@/lib/sponsor-finance";

export const dynamic = "force-dynamic";

function contractPayload(body: Record<string, unknown>, sponsorId: string, now: string, existing: Record<string, unknown> = {}) {
  const status = normalizeContractStatus(body.status ?? existing.status ?? "draft");
  const valueCents = cleanMoneyCents(body.contractValue ?? body.contractValueCents ?? existing.contractValueCents);
  return {
    sponsorId,
    ownerUid: sponsorId,
    title: cleanText(body.title ?? existing.title, "Untitled sponsor contract").slice(0, 180),
    linkedProposalId: cleanText(body.proposalId ?? body.linkedProposalId ?? existing.linkedProposalId).slice(0, 120) || null,
    linkedCampaignId: cleanText(body.campaignId ?? body.linkedCampaignId ?? existing.linkedCampaignId).slice(0, 120) || null,
    creatorOrHostContext: cleanText(body.creatorOrHostContext ?? existing.creatorOrHostContext).slice(0, 220),
    status,
    contractValueCents: valueCents,
    currency: cleanText(body.currency ?? existing.currency, "USD").slice(0, 12),
    signatureStatus: cleanText(body.signatureStatus ?? existing.signatureStatus, "foundation_not_enabled").slice(0, 80),
    deliverablesSummary: safeArray(body.deliverablesSummary ?? existing.deliverablesSummary),
    paymentTermsFoundation: cleanText(body.paymentTermsFoundation ?? existing.paymentTermsFoundation, "Payment terms are foundation-only. No payment release is active.").slice(0, 900),
    milestoneScheduleFoundation: safeArray(body.milestoneScheduleFoundation ?? existing.milestoneScheduleFoundation),
    cancellationTermsFoundation: cleanText(body.cancellationTermsFoundation ?? existing.cancellationTermsFoundation).slice(0, 900),
    contentUsageRightsFoundation: cleanText(body.contentUsageRightsFoundation ?? existing.contentUsageRightsFoundation).slice(0, 900),
    confidentialityFoundation: cleanText(body.confidentialityFoundation ?? existing.confidentialityFoundation).slice(0, 900),
    disputeResolutionFoundation: cleanText(body.disputeResolutionFoundation ?? existing.disputeResolutionFoundation).slice(0, 900),
    legalReviewNeeded: Boolean(body.legalReviewNeeded ?? existing.legalReviewNeeded ?? true),
    eSignatureProvider: "not_configured",
    fundingStatus: "not_active",
    paymentReleaseStatus: "not_active",
    isFoundationOnly: true,
    updatedAt: now,
    updatedBy: sponsorId,
    version: Number(existing.version ?? 0) + 1
  };
}

export async function GET(request: Request) {
  const { context, response } = await requireSponsorContext(request);
  if (response) return response;
  if (!context) return serverError("Sponsor access could not be verified.");
  try {
    const snap = await context.db.collection("sponsorContracts").where("sponsorId", "==", context.user.uid).limit(100).get();
    const contracts = snap.docs.map((doc) => ({ id: doc.id, ...doc.data() })).sort((a, b) => String((b as any).updatedAt ?? "").localeCompare(String((a as any).updatedAt ?? "")));
    return ok({ contracts }, "Sponsor contracts loaded.");
  } catch (error) {
    console.error("[sponsor-contracts:get]", { userId: context.user.uid, message: error instanceof Error ? error.message : String(error) });
    return serverError("Sponsor contracts could not be loaded.");
  }
}

export async function POST(request: Request) {
  const { context, response } = await requireSponsorContext(request);
  if (response) return response;
  if (!context) return serverError("Sponsor access could not be verified.");
  const parsed = await readJson(request);
  if (parsed.response) return parsed.response;
  const body = parsed.body && typeof parsed.body === "object" ? parsed.body as Record<string, unknown> : {};
  if (cleanText(body.title).length < 3) return validationError({ title: "Contract title is required." });
  try {
    const now = isoNow();
    const ref = context.db.collection("sponsorContracts").doc();
    const contract = { id: ref.id, ...contractPayload(body, context.user.uid, now), createdAt: now, createdBy: context.user.uid };
    await Promise.all([
      ref.set(contract),
      context.db.collection("sponsorContractRevisions").add({ sponsorId: context.user.uid, contractId: ref.id, status: contract.status, changeSummary: "Contract foundation created.", createdAt: now, createdBy: context.user.uid }),
      context.db.collection("sponsorFinancialAuditLogs").add({ sponsorId: context.user.uid, relatedContractId: ref.id, action: "contract_foundation_created", moneyMovement: false, createdAt: now, createdBy: context.user.uid })
    ]);
    return ok({ contract }, "Contract foundation saved. No signature, funding, or payment release was activated.");
  } catch (error) {
    console.error("[sponsor-contracts:post]", { userId: context.user.uid, message: error instanceof Error ? error.message : String(error) });
    return serverError("Contract foundation could not be saved.");
  }
}
