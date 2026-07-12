import { ok, serverError } from "@/lib/server/responses";
import { requireSponsorContext } from "@/lib/server/sponsor";
import { defaultAnalyticsSummary } from "@/lib/sponsor-operations";

export const dynamic = "force-dynamic";
type Params = { params: Promise<{ campaignId: string }> };

export async function GET(request: Request, { params }: Params) {
  const { campaignId } = await params;
  const { context, response } = await requireSponsorContext(request);
  if (response) return response;
  if (!context) return serverError("Sponsor access could not be verified.");
  try {
    const snap = await context.db.collection("sponsorCampaignAnalytics").where("sponsorId", "==", context.user.uid).where("relatedCampaignId", "==", campaignId).limit(1).get();
    const analytics = snap.docs[0] ? { id: snap.docs[0].id, ...snap.docs[0].data() } : null;
    return ok({ campaignId, analytics, summary: defaultAnalyticsSummary(), exportStatus: "foundation_only", message: "No unverified metric is shown as verified." }, "Campaign analytics foundation loaded.");
  } catch (error) {
    console.error("[sponsor-campaign-analytics:get]", { userId: context.user.uid, campaignId, message: error instanceof Error ? error.message : String(error) });
    return serverError("Campaign analytics could not be loaded.");
  }
}
