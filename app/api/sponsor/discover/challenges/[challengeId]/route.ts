import { getChallengeDisplayStatus } from "@/lib/challenge-status";
import { requireSponsorContext } from "@/lib/server/sponsor";
import { fail, ok, serverError } from "@/lib/server/responses";

export const dynamic = "force-dynamic";

export async function GET(request: Request, { params }: { params: Promise<{ challengeId: string }> }) {
  const { context, response } = await requireSponsorContext(request);
  if (response) return response;
  if (!context) return serverError("Sponsor access could not be verified.");
  try {
    const { challengeId } = await params;
    const snap = await context.db.collection("challenges").doc(challengeId).get();
    if (!snap.exists) return fail("Challenge opportunity was not found.", 404, undefined, "NOT_FOUND");
    const data = snap.data() ?? {};
    if (String(data.visibility ?? "public").toLowerCase() !== "public") return fail("Challenge opportunity was not found.", 404, undefined, "NOT_FOUND");
    const opportunity = {
      id: snap.id,
      title: data.title ?? "Untitled challenge",
      description: data.description ?? "Challenge overview pending.",
      creatorId: data.creatorId ?? null,
      creatorName: data.creatorName ?? "Creator details pending",
      participantCount: Number(data.participantCount ?? 0),
      category: data.category ?? "Not available yet",
      targetAudience: data.targetAudience ?? "Target audience foundation pending",
      sponsorshipPackages: Array.isArray(data.sponsorPackages) ? data.sponsorPackages : [],
      placements: Array.isArray(data.sponsorPlacementOptions) ? data.sponsorPlacementOptions : ["Challenge page logo", "Voting page banner", "Leaderboard sponsor placement", "Winner announcement branding", "Sponsored prize section", "Campaign CTA button"],
      estimatedReach: data.expectedReachLabel ?? "Estimated reach foundation only. No guaranteed reach is promised.",
      sponsorshipBudget: data.minimumSponsorshipAmount ? `$${data.minimumSponsorshipAmount}` : "Budget foundation pending",
      timeline: { startsAt: data.startsAt ?? null, endsAt: data.endsAt ?? null, votingDeadline: data.votingDeadline ?? null },
      deliverables: ["Brand placement foundation", "Campaign CTA foundation", "Post-campaign reporting foundation"],
      riskIndicators: { adminReviewRequired: Boolean(data.adminReviewRequired), creatorVerified: data.creatorVerificationStatus ?? "not_available", fundingEnabled: false },
      status: getChallengeDisplayStatus(data as any)
    };
    return ok({ opportunity }, "Challenge sponsorship opportunity loaded.");
  } catch (error) {
    console.error("[sponsor-discover-challenge:get]", { userId: context.user.uid, message: error instanceof Error ? error.message : String(error) });
    return serverError("Challenge opportunity could not be loaded.");
  }
}
