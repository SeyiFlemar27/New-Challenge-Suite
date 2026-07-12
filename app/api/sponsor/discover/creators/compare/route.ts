import { requireSponsorContext } from "@/lib/server/sponsor";
import { ok, serverError } from "@/lib/server/responses";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const { context, response } = await requireSponsorContext(request);
  if (response) return response;
  if (!context) return serverError("Sponsor access could not be verified.");
  try {
    const ids = (new URL(request.url).searchParams.get("ids") ?? "").split(",").map((id) => id.trim()).filter(Boolean).slice(0, 4);
    const docs = await Promise.all(ids.map((id) => context.db.collection("profiles").doc(id).get()));
    const creators = docs.flatMap((doc) => doc.exists ? [{ id: doc.id, displayName: doc.data()?.displayName ?? doc.data()?.username ?? "Creator", audienceSize: doc.data()?.audienceSizeLabel ?? "Not available yet", engagement: doc.data()?.engagementRateLabel ?? "Not available yet", category: doc.data()?.primaryCategory ?? doc.data()?.category ?? "Not available yet", price: doc.data()?.startingCollaborationPriceLabel ?? "Not available yet", location: doc.data()?.location ?? "Not available yet", campaignCompletion: doc.data()?.completedSponsorCampaigns ?? "Not available yet", reputation: doc.data()?.sponsorRatingLabel ?? "Not available yet", responseTime: doc.data()?.responseTimeLabel ?? "Not available yet", challengePerformance: doc.data()?.challengePerformanceSummary ?? "Not available yet" }] : []);
    return ok({ creators, maxCreators: 4 }, "Creator comparison loaded.");
  } catch (error) {
    console.error("[sponsor-creator-compare:get]", { userId: context.user.uid, message: error instanceof Error ? error.message : String(error) });
    return serverError("Creator comparison could not be loaded.");
  }
}

