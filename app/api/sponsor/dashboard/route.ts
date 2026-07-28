import { requireSponsorContext } from "@/lib/server/sponsor";
import { buildSponsorReportingSummary } from "@/lib/server/sponsor-reporting";
import { ok, serverError } from "@/lib/server/responses";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const { context, response } = await requireSponsorContext(request);
  if (response) return response;
  if (!context) return serverError("Sponsor access could not be verified.");
  const { db, user, sponsorProfile: sponsor } = context;
  try {
    const [activitySnap, notificationsSnap, campaignsSnap, proposalsSnap, contributionsSnap, deliverablesSnap] = await Promise.all([
      db.collection("sponsorActivity").where("userId", "==", user.uid).orderBy("createdAt", "desc").limit(10).get(),
      db.collection("sponsorNotifications").where("userId", "==", user.uid).orderBy("createdAt", "desc").limit(10).get(),
      db.collection("sponsorCampaignBriefs").where("sponsorId", "==", user.uid).limit(100).get(),
      db.collection("sponsorProposals").where("sponsorId", "==", user.uid).limit(100).get(),
      db.collection("sponsorContributions").where("sponsorId", "==", user.uid).limit(100).get(),
      db.collection("sponsorCampaignDeliverables").where("sponsorId", "==", user.uid).limit(100).get()
    ]);
    const campaigns = campaignsSnap.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
    const proposals = proposalsSnap.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
    const contributions: Array<Record<string, unknown> & { id: string }> = contributionsSnap.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
    const challengeIds = [...new Set(contributions.map((item) => String(item.challengeId ?? "")).filter(Boolean))].slice(0, 100);
    const challengeSnaps = challengeIds.length ? await db.getAll(...challengeIds.map((id) => db.collection("challenges").doc(id))) : [];
    const challenges = new Map(challengeSnaps.filter((snap) => snap.exists).map((snap) => [snap.id, { id: snap.id, ...snap.data() }]));
    const reporting = buildSponsorReportingSummary({
      campaigns,
      proposals,
      contributions,
      deliverables: deliverablesSnap.docs.map((doc) => ({ id: doc.id, ...doc.data() })),
      challenges
    });
    return ok({
      sponsorProfile: sponsor,
      campaigns,
      proposals,
      ...reporting,
      activity: activitySnap.docs.map((doc) => ({ id: doc.id, ...doc.data() })),
      notifications: notificationsSnap.docs.map((doc) => ({ id: doc.id, ...doc.data() }))
    }, "Sponsor dashboard loaded.");
  } catch (error) {
    console.error("[sponsor-dashboard:get]", { userId: user.uid, message: error instanceof Error ? error.message : String(error) });
    return serverError("Sponsor dashboard could not be loaded.");
  }
}