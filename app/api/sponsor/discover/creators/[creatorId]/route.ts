import { requireSponsorContext } from "@/lib/server/sponsor";
import { fail, ok, serverError } from "@/lib/server/responses";

export const dynamic = "force-dynamic";

function safeCreator(id: string, data: Record<string, unknown>) {
  if (String(data.profileVisibility ?? "public") === "private") return null;
  return {
    id,
    displayName: data.displayName ?? data.fullName ?? data.username ?? "Challenge Suite Creator",
    username: data.username ?? data.handle ?? id,
    avatarUrl: data.avatarUrl ?? data.photoURL ?? null,
    verificationStatus: data.creatorVerificationStatus ?? data.verificationStatus ?? "not_available",
    categories: Array.isArray(data.categories) ? data.categories : [data.primaryCategory ?? data.category ?? "Not available yet"],
    niches: Array.isArray(data.niches) ? data.niches : [data.creatorNiche ?? data.niche ?? "Not available yet"],
    location: data.location ?? data.city ?? data.country ?? "Not available yet",
    bio: data.bio ?? data.about ?? "Creator sponsor profile details will appear after opt-in.",
    audienceOverview: data.audienceOverview ?? "Performance data will appear after completed sponsor campaigns.",
    previousCampaigns: data.previousSponsorCampaigns ?? "Not available yet",
    challengePerformance: data.challengePerformanceSummary ?? "Not available yet",
    portfolio: Array.isArray(data.portfolio) ? data.portfolio : [],
    ratings: data.sponsorRatingLabel ?? "Not available yet",
    typicalPricing: data.startingCollaborationPriceLabel ?? "Not available yet",
    availability: data.sponsorAvailability ?? "Not available yet",
    preferredSponsorCategories: Array.isArray(data.preferredSponsorCategories) ? data.preferredSponsorCategories : []
  };
}

export async function GET(request: Request, { params }: { params: Promise<{ creatorId: string }> }) {
  const { context, response } = await requireSponsorContext(request);
  if (response) return response;
  if (!context) return serverError("Sponsor access could not be verified.");
  try {
    const { creatorId } = await params;
    const snap = await context.db.collection("profiles").doc(creatorId).get();
    if (!snap.exists) return fail("Creator was not found.", 404, undefined, "NOT_FOUND");
    const creator = safeCreator(snap.id, snap.data() ?? {});
    if (!creator) return fail("Creator is not sponsor-visible.", 404, undefined, "NOT_FOUND");
    return ok({ creator }, "Creator preview loaded.");
  } catch (error) {
    console.error("[sponsor-discover-creator:get]", { userId: context.user.uid, message: error instanceof Error ? error.message : String(error) });
    return serverError("Creator preview could not be loaded.");
  }
}
