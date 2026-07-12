import { conflict, readJson, serverError } from "@/lib/server/responses";
import { requireSponsorContext } from "@/lib/server/sponsor";
import { cleanMoneyCents, cleanText, isoNow } from "@/lib/sponsor-finance";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const { context, response } = await requireSponsorContext(request);
  if (response) return response;
  if (!context) return serverError("Sponsor access could not be verified.");
  const parsed = await readJson(request);
  if (parsed.response) return parsed.response;
  const body = parsed.body && typeof parsed.body === "object" ? parsed.body as Record<string, unknown> : {};
  const now = isoNow();
  const funding = {
    sponsorId: context.user.uid,
    ownerUid: context.user.uid,
    relatedCampaignId: cleanText(body.campaignId ?? body.relatedCampaignId).slice(0, 120) || null,
    requestedAmountCents: cleanMoneyCents(body.amount ?? body.requestedAmountCents),
    currency: cleanText(body.currency, "USD").slice(0, 12),
    status: "setup_required",
    contractRequirementStatus: "required_before_funding",
    verificationRequirementStatus: "required_before_funding",
    paymentProviderStatus: "not_configured",
    providerConfirmationRequired: true,
    clientPaymentStatusTrusted: false,
    moneyMovement: false,
    safeNextStep: "Configure provider-backed campaign funding before accepting money.",
    createdAt: now,
    updatedAt: now,
    createdBy: context.user.uid,
    updatedBy: context.user.uid
  };
  try {
    const ref = await context.db.collection("sponsorCampaignFunding").add(funding);
    await context.db.collection("sponsorFinancialAuditLogs").add({ sponsorId: context.user.uid, relatedFundingId: ref.id, action: "campaign_funding_foundation_requested", moneyMovement: false, createdAt: now, createdBy: context.user.uid });
    return conflict("Funding setup required. No card was charged and no campaign was marked funded.", { funding: { id: ref.id, ...funding }, code: "FUNDING_PROVIDER_NOT_CONFIGURED" });
  } catch (error) {
    console.error("[sponsor-funding-foundation:post]", { userId: context.user.uid, message: error instanceof Error ? error.message : String(error) });
    return serverError("Campaign funding foundation could not be recorded.");
  }
}