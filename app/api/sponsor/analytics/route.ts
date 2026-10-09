import { ok, serverError } from "@/lib/server/responses";
import { requireSponsorContext, requireSponsorPermission } from "@/lib/server/sponsor";

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
    const startDay = start.toISOString().slice(0, 10);
    const endDay = end.toISOString().slice(0, 10);
    const dailyQuery = context.db.collection("sponsorAnalyticsDaily")
      .where("sponsorId", "==", context.sponsorId)
      .where("date", ">=", startDay)
      .where("date", "<=", endDay)
      .orderBy("date", "asc");
    const dailyByDate = new Map<string, { date: string; validImpressions: number; uniqueCtaClicks: number; uniqueSessions: number; invalidEventsExcluded: number }>();
    let dailyPage = await dailyQuery.limit(100).get();
    while (!dailyPage.empty) {
      for (const doc of dailyPage.docs) {
        const row = doc.data();
        const date = String(row.date ?? "");
        if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) continue;
        const day = dailyByDate.get(date) ?? { date, validImpressions: 0, uniqueCtaClicks: 0, uniqueSessions: 0, invalidEventsExcluded: 0 };
        day.validImpressions += Number(row.validImpressions ?? 0);
        day.uniqueCtaClicks += Number(row.uniqueCtaClicks ?? 0);
        day.uniqueSessions += Number(row.uniqueSessions ?? 0);
        day.invalidEventsExcluded += Number(row.invalidEventsExcluded ?? 0);
        dailyByDate.set(date, day);
      }
      if (dailyPage.size < 100) break;
      dailyPage = await dailyQuery.startAfter(dailyPage.docs.at(-1)!).limit(100).get();
    }
    const [snapshotsSnap, sponsorshipCountSnap] = await Promise.all([
      context.db.collection("sponsorAnalyticsSnapshots").where("sponsorId", "==", context.sponsorId).limit(100).get(),
      context.db.collection("sponsorships").where("sponsorId", "==", context.sponsorId).count().get()
    ]);
    const daily = [...dailyByDate.values()].sort((left, right) => left.date.localeCompare(right.date));
    const validImpressions = daily.reduce((sum, day) => sum + day.validImpressions, 0);
    const uniqueCtaClicks = daily.reduce((sum, day) => sum + day.uniqueCtaClicks, 0);
    const liveMetrics = { validImpressions, uniqueCtaClicks, uniqueSessions: daily.reduce((sum, day) => sum + day.uniqueSessions, 0), invalidEventsExcluded: daily.reduce((sum, day) => sum + day.invalidEventsExcluded, 0), clickThroughRate: validImpressions ? Number(((uniqueCtaClicks / validImpressions) * 100).toFixed(2)) : null };
    const snapshots = snapshotsSnap.docs.map((doc) => ({ id: doc.id, ...doc.data() } as Record<string, unknown> & { id: string })).sort((left, right) => String(right.reconciledAt ?? right.updatedAt ?? "").localeCompare(String(left.reconciledAt ?? left.updatedAt ?? "")));
    const finalized = snapshots.filter((item) => item.finalized === true);
    return ok({
      analytics: {
        state: finalized.length ? "finalized_available" : daily.length ? "live_provisional" : "not_recorded",
        live: { metrics: liveMetrics, daily, provisional: true, source: "trusted_sponsor_placement_events", completeForRequestedRange: true },
        finalized,
      sponsorshipCount: sponsorshipCountSnap.data().count,
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
