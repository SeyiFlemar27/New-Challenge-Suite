import { conflict, fail, readJson, serverError } from "@/lib/server/responses";
import { requireSponsorContext, requireSponsorPermission } from "@/lib/server/sponsor";
import { cleanMoneyCents, cleanText, isoNow } from "@/lib/sponsor-finance";
import { proposalFundingEligible } from "@/lib/sponsor-collaboration";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const { context, response } = await requireSponsorContext(request);
  if (response) return response;
  if (!context) return serverError("Sponsor access could not be verified.");
  const permissionError = requireSponsorPermission(context, "wallet.fund");
  if (permissionError) return permissionError;
  const parsed = await readJson(request);
  if (parsed.response) return parsed.response;
  const body = parsed.body && typeof parsed.body === "object" ? parsed.body as Record<string, unknown> : {};
  const proposalId = cleanText(body.proposalId).slice(0, 120);
  if (proposalId) {
    const proposalSnap = await context.db.collection("sponsorProposals").doc(proposalId).get();
    const proposal = proposalSnap.data() ?? {};
    if (!proposalSnap.exists || proposal.sponsorId !== context.sponsorId) return fail("Proposal not found.", 404, undefined, "NOT_FOUND");
    if (!proposalFundingEligible(proposal)) return fail("Both parties must accept the same proposal revision before funding setup can begin.", 422, { fundingStatus: proposal.fundingStatus ?? "not_active" }, "PROPOSAL_NOT_FUNDING_ELIGIBLE");
  }
  const now = isoNow();
  const funding = {
    sponsorId: context.sponsorId,
    sponsorOrganizationId: context.organizationId,
    ownerUid: context.user.uid,
    relatedProposalId: proposalId || null,
    relatedCampaignId: cleanText(body.campaignId ?? body.relatedCampaignId).slice(0, 120) || null,
    requestedAmountCents: cleanMoneyCents(body.amount ?? body.requestedAmountCents),
    currency: cleanText(body.currency, "USD").slice(0, 12),
    status: "setup_required",
    contractRequirementStatus: proposalId ? "accepted_revision_confirmed" : "required_before_funding",
    verificationRequirementStatus: "required_before_funding",
    paymentProviderStatus: "not_configured",
    providerConfirmationRequired: true,
    clientPaymentStatusTrusted: false,
    moneyMovement: false,
    safeNextStep: "Configure provider-backed funding before accepting money.",
    createdAt: now,
    updatedAt: now,
    createdBy: context.user.uid,
    updatedBy: context.user.uid
  };
  try {
    const ref = proposalId ? context.db.collection("sponsorCampaignFunding").doc(`${proposalId}_provider_setup`) : context.db.collection("sponsorCampaignFunding").doc();
    const batch = context.db.batch();
    batch.set(ref, funding, { merge: true });
    batch.set(context.db.collection("sponsorFinancialAuditLogs").doc(`${ref.id}_setup_requested`), { sponsorId: context.sponsorId, sponsorOrganizationId: context.organizationId, relatedFundingId: ref.id, relatedProposalId: proposalId || null, action: "campaign_funding_foundation_requested", moneyMovement: false, createdAt: now, createdBy: context.user.uid }, { merge: true });
    await batch.commit();
    return conflict("Funding setup required. No card was charged and no sponsorship was marked funded.", { funding: { id: ref.id, ...funding }, code: "FUNDING_PROVIDER_NOT_CONFIGURED" });
  } catch (error) {
    console.error("[sponsor-funding-foundation:post]", { userId: context.user.uid, message: error instanceof Error ? error.message : String(error) });
    return serverError("Sponsor funding foundation could not be recorded.");
  }
}
