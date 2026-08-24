import { requireSponsorContext } from "@/lib/server/sponsor";
import { buildSponsorReportingSummary } from "@/lib/server/sponsor-reporting";
import { ok, serverError } from "@/lib/server/responses";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const { context, response } = await requireSponsorContext(request);
  if (response) return response;
  if (!context) return serverError("Sponsor access could not be verified.");
  const { db, user, sponsorId, sponsorProfile: sponsor } = context;
  try {
    const widgetNames = ["activity", "notifications", "campaigns", "proposals", "funding", "deliverables", "messages"] as const;
    const results = await Promise.allSettled([
      db.collection("sponsorActivity").where("userId", "==", user.uid).orderBy("createdAt", "desc").limit(10).get(),
      db.collection("sponsorNotifications").where("userId", "==", user.uid).orderBy("createdAt", "desc").limit(10).get(),
      db.collection("sponsorCampaignBriefs").where("sponsorId", "==", sponsorId).limit(100).get(),
      db.collection("sponsorProposals").where("sponsorId", "==", sponsorId).limit(100).get(),
      db.collection("sponsorContributions").where("sponsorId", "==", sponsorId).limit(100).get(),
      db.collection("sponsorCampaignDeliverables").where("sponsorId", "==", sponsorId).limit(100).get(),
      db.collection("sponsorConversations").where("sponsorId", "==", sponsorId).limit(100).get()
    ]);
    const widgetErrors: Record<string, string> = {};
    const docs = (index: number) => {
      const result = results[index];
      if (result.status === "fulfilled") return result.value.docs;
      widgetErrors[widgetNames[index]] = "This section could not be loaded. Retry the overview to check again.";
      console.error("[sponsor-dashboard:widget]", { userId: user.uid, widget: widgetNames[index], message: result.reason instanceof Error ? result.reason.message : String(result.reason) });
      return [];
    };
    const activityDocs = docs(0);
    const notificationDocs = docs(1);
    const campaignDocs = docs(2);
    const proposalDocs = docs(3);
    const contributionDocs = docs(4);
    const deliverableDocs = docs(5);
    const conversationDocs = docs(6);
    const campaigns = campaignDocs.map((doc) => ({ id: doc.id, ...doc.data() }));
    const proposals = proposalDocs.map((doc) => ({ id: doc.id, ...doc.data() }));
    const contributions: Array<Record<string, unknown> & { id: string }> = contributionDocs.map((doc) => ({ id: doc.id, ...doc.data() }));
    const challengeIds = [...new Set(contributions.map((item) => String(item.challengeId ?? "")).filter(Boolean))].slice(0, 100);
    const challengeSnaps = challengeIds.length ? await db.getAll(...challengeIds.map((id) => db.collection("challenges").doc(id))).catch((error) => {
      widgetErrors.funding = "Funding context could not be loaded. Retry the overview to check again.";
      console.error("[sponsor-dashboard:funding-context]", { userId: user.uid, message: error instanceof Error ? error.message : String(error) });
      return [];
    }) : [];
    const challenges = new Map(challengeSnaps.filter((snap) => snap.exists).map((snap) => [snap.id, { id: snap.id, ...snap.data() }]));
    const settlementResults = await Promise.allSettled(challengeIds.slice(0, 50).map((id) => db.collection("challengeSettlements").where("challengeId", "==", id).limit(5).get()));
    const settlementSnaps = settlementResults.flatMap((result) => result.status === "fulfilled" ? [result.value] : []);
    if (settlementResults.some((result) => result.status === "rejected")) widgetErrors.funding = "Some funding details could not be loaded. Retry the overview to check again.";
    const settlements = new Map<string, Record<string, unknown>>();
    for (const snap of settlementSnaps) {
      for (const doc of snap.docs) {
        const data = { id: doc.id, ...doc.data() } as Record<string, unknown> & { id: string };
        const challengeId = String(data.challengeId ?? "");
        const existing = settlements.get(challengeId);
        if (!existing || String(data.createdAt ?? "") > String(existing.createdAt ?? "")) settlements.set(challengeId, data);
      }
    }
    const reporting = buildSponsorReportingSummary({
      campaigns,
      proposals,
      contributions,
      deliverables: deliverableDocs.map((doc) => ({ id: doc.id, ...doc.data() })),
      challenges,
      settlements
    });
    return ok({
      sponsorProfile: sponsor,
      campaigns,
      proposals,
      ...reporting,
      activity: activityDocs.map((doc) => ({ id: doc.id, ...doc.data() })),
      notifications: notificationDocs.map((doc) => ({ id: doc.id, ...doc.data() })),
      widgetErrors,
      workspaceSignals: {
        hasConversations: conversationDocs.length > 0,
        conversationCount: conversationDocs.length,
        unreadMessageCount: conversationDocs.reduce((total, doc) => total + Number(doc.data().unreadCount ?? 0), 0),
        hasReportableData: campaigns.length > 0 || proposals.length > 0 || contributions.length > 0
      }
    }, "Sponsor dashboard loaded.");
  } catch (error) {
    console.error("[sponsor-dashboard:get]", { userId: user.uid, message: error instanceof Error ? error.message : String(error) });
    return serverError("Sponsor dashboard could not be loaded.");
  }
}
