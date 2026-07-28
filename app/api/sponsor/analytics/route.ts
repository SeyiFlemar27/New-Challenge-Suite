import { ok, serverError } from "@/lib/server/responses";
import { buildSponsorReportingSummary } from "@/lib/server/sponsor-reporting";
import { requireSponsorContext } from "@/lib/server/sponsor";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const { context, response } = await requireSponsorContext(request);
  if (response) return response;
  if (!context) return serverError("Sponsor access could not be verified.");
  try {
    const [snapshotsSnap, campaignAnalyticsSnap, campaignsSnap, proposalsSnap, contributionsSnap, deliverablesSnap] = await Promise.all([
      context.db.collection("sponsorAnalyticsSnapshots").where("sponsorId", "==", context.user.uid).limit(25).get(),
      context.db.collection("sponsorCampaignAnalytics").where("sponsorId", "==", context.user.uid).limit(25).get(),
      context.db.collection("sponsorCampaignBriefs").where("sponsorId", "==", context.user.uid).limit(100).get(),
      context.db.collection("sponsorProposals").where("sponsorId", "==", context.user.uid).limit(100).get(),
      context.db.collection("sponsorContributions").where("sponsorId", "==", context.user.uid).limit(100).get(),
      context.db.collection("sponsorCampaignDeliverables").where("sponsorId", "==", context.user.uid).limit(100).get()
    ]);
    const summary = buildSponsorReportingSummary({
      campaigns: campaignsSnap.docs.map((doc) => ({ id: doc.id, ...doc.data() })),
      proposals: proposalsSnap.docs.map((doc) => ({ id: doc.id, ...doc.data() })),
      contributions: contributionsSnap.docs.map((doc) => ({ id: doc.id, ...doc.data() })),
      deliverables: deliverablesSnap.docs.map((doc) => ({ id: doc.id, ...doc.data() }))
    });
    return ok({
      summary,
      snapshots: snapshotsSnap.docs.map((doc) => ({ id: doc.id, ...doc.data() })),
      campaigns: campaignAnalyticsSnap.docs.map((doc) => ({ id: doc.id, ...doc.data() })),
      dataSourceLabels: ["webhook_confirmed", "verified", "not_tracked_yet"]
    }, "Sponsor analytics loaded.");
  } catch (error) {
    console.error("[sponsor-analytics:get]", { userId: context.user.uid, message: error instanceof Error ? error.message : String(error) });
    return serverError("Sponsor analytics could not be loaded.");
  }
}