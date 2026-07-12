import { requireSponsorContext } from "@/lib/server/sponsor";
import { ok, serverError } from "@/lib/server/responses";

export const dynamic = "force-dynamic";

function safeCreator(id: string, data: Record<string, unknown>) {
  const accountType = String(data.accountType ?? data.role ?? "").toLowerCase();
  const isCreator = ["creator", "host", "user"].includes(accountType) || Boolean(data.creatorProfileEnabled || data.canCreateChallenges);
  const privateProfile = String(data.profileVisibility ?? "public") === "private";
  if (!isCreator || privateProfile) return null;
  return {
    id,
    displayName: data.displayName ?? data.fullName ?? data.username ?? "Challenge Suite Creator",
    username: data.username ?? data.handle ?? id,
    avatarUrl: data.avatarUrl ?? data.photoURL ?? null,
    verificationStatus: data.creatorVerificationStatus ?? data.verificationStatus ?? "not_available",
    niche: data.creatorNiche ?? data.niche ?? data.primaryCategory ?? "Not available yet",
    category: data.primaryCategory ?? data.category ?? "Not available yet",
    location: data.location ?? data.city ?? data.country ?? "Not available yet",
    audienceSizeLabel: data.audienceSizeLabel ?? "Not available yet",
    engagementRateLabel: data.engagementRateLabel ?? "Performance data will appear after completed sponsor campaigns.",
    completedCampaignsLabel: data.completedSponsorCampaigns ?? "Not available yet",
    sponsorRatingLabel: data.sponsorRatingLabel ?? "Not available yet",
    responseTimeLabel: data.responseTimeLabel ?? "Not available yet",
    startingPriceLabel: data.startingCollaborationPriceLabel ?? "Not available yet",
    challengeCategory: data.preferredChallengeCategory ?? data.category ?? "Not available yet",
    sponsorVisible: true
  };
}

export async function GET(request: Request) {
  const { context, response } = await requireSponsorContext(request);
  if (response) return response;
  if (!context) return serverError("Sponsor access could not be verified.");
  try {
    const url = new URL(request.url);
    const search = url.searchParams.get("q")?.toLowerCase().trim() ?? "";
    const snap = await context.db.collection("profiles").limit(200).get();
    let creators = snap.docs.flatMap((doc) => {
      const creator = safeCreator(doc.id, doc.data());
      return creator ? [creator] : [];
    });
    if (search) creators = creators.filter((creator) => [creator.displayName, creator.username, creator.niche, creator.category, creator.location].some((value) => String(value).toLowerCase().includes(search)));
    return ok({ creators: creators.slice(0, 80), filters: { search, metricsAreFoundation: true } }, "Sponsor-safe creators loaded.");
  } catch (error) {
    console.error("[sponsor-discover-creators:get]", { userId: context.user.uid, message: error instanceof Error ? error.message : String(error) });
    return serverError("Creator discovery could not be loaded.");
  }
}

