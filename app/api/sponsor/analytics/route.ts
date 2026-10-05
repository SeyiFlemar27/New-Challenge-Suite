import { ok, serverError } from "@/lib/server/responses";
import { requireSponsorContext, requireSponsorPermission } from "@/lib/server/sponsor";
import { reconcileSponsorAnalytics, reconcileSponsorAnalyticsByDay } from "@/lib/server/sponsor-analytics";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const { context, response } = await requireSponsorContext(request, { allowHistorical: true });
  if (response) return response;
  if (!context) return serverError("Sponsor access could not be verified.");
  const permission = requireSponsorPermission(context, "analytics.view");
  if (permission) return permission;
  try {
    const url = new URL(request.url);
    const end = url.searchParams.get("end") ? new Date(String(url.searchParams.get("end"))) : new Date();
    const start = url.searchParams.get("start") ? new Date(String(url.searchParams.get("start"))) : new Date(end.getTime() - 30 * 24 * 60 * 60 * 1000);
    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || start >= end || end.getTime() - start.getTime() > 92 * 24 * 60 * 60 * 1000) return serverError("Choose a valid analytics date range of up to 92 days.");
    const [snapshotsSnap, eventsSnap, sponsorshipsSnap] = await Promise.all([
      context.db.collection("sponsorAnalyticsSnapshots").where("sponsorId", "==", context.sponsorId).limit(100).get(),
      context.db.collection("sponsorAnalyticsEvents").where("sponsorId", "==", context.sponsorId).where("occurredAt", ">=", start.toISOString()).where("occurredAt", "<", end.toISOString()).orderBy("occurredAt", "asc").limit(1000).get(),
      context.db.collection("sponsorships").where("sponsorId", "==", context.sponsorId).limit(100).get()
    ]);
    const events = eventsSnap.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
    const liveMetrics = reconcileSponsorAnalytics(events);
    const daily = reconcileSponsorAnalyticsByDay(events);
    const snapshots = snapshotsSnap.docs.map((doc) => ({ id: doc.id, ...doc.data() } as Record<string, unknown> & { id: string })).sort((left, right) => String(right.reconciledAt ?? right.updatedAt ?? "").localeCompare(String(left.reconciledAt ?? left.updatedAt ?? "")));
    const finalized = snapshots.filter((item) => item.finalized === true);
    return ok({
      analytics: {
        state: finalized.length ? "finalized_available" : events.length ? "live_provisional" : "not_recorded",
        live: { metrics: liveMetrics, daily, provisional: true, source: "trusted_sponsor_placement_events" },
        finalized,
        sponsorshipCount: sponsorshipsSnap.size,
        definitions: {
          validImpressions: "Deduplicated Sponsor placement impressions not classified as invalid or fraudulent.",
          uniqueCtaClicks: "Deduplicated Sponsor CTA clicks not classified as invalid or fraudulent.",
          clickThroughRate: "Unique valid CTA clicks divided by valid impressions."
        }
      },
      dataSourceLabels: ["live_provisional", "finalized_reconciled", "not_recorded"]
    , range: { start: start.toISOString(), end: end.toISOString() } }, "Sponsor analytics loaded.");
  } catch (error) {
    console.error("[sponsor-analytics:get]", { userId: context.user.uid, message: error instanceof Error ? error.message : String(error) });
    return serverError("Sponsor analytics could not be loaded.");
  }
}
