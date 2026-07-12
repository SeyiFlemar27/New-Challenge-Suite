import { ok, serverError } from "@/lib/server/responses";
import { requireSponsorContext } from "@/lib/server/sponsor";
import { defaultAnalyticsSummary } from "@/lib/sponsor-operations";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const { context, response } = await requireSponsorContext(request);
  if (response) return response;
  if (!context) return serverError("Sponsor access could not be verified.");
  try {
    const [snapshotsSnap, campaignSnap] = await Promise.all([
      context.db.collection("sponsorAnalyticsSnapshots").where("sponsorId", "==", context.user.uid).limit(25).get(),
      context.db.collection("sponsorCampaignAnalytics").where("sponsorId", "==", context.user.uid).limit(25).get()
    ]);
    return ok({ summary: defaultAnalyticsSummary(), snapshots: snapshotsSnap.docs.map((doc) => ({ id: doc.id, ...doc.data() })), campaigns: campaignSnap.docs.map((doc) => ({ id: doc.id, ...doc.data() })), dataSourceLabels: ["verified", "estimated", "externally_tracked", "manually_entered", "foundation_unavailable"] }, "Sponsor analytics foundation loaded.");
  } catch (error) {
    console.error("[sponsor-analytics:get]", { userId: context.user.uid, message: error instanceof Error ? error.message : String(error) });
    return serverError("Sponsor analytics could not be loaded.");
  }
}
