import { getChallengeDisplayStatus } from "@/lib/challenge-status";
import { requireSponsorContext } from "@/lib/server/sponsor";
import { fail, ok, serverError } from "@/lib/server/responses";
import { sponsorPlacementFoundation, sponsorshipDiscussionFoundation, validateSponsorFundingWindow } from "@/lib/server/payout-structure";

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
    const sponsorReady = Boolean(data.sponsorEnabled || data.sponsorReady || (data.monetization as Record<string, unknown> | undefined)?.sponsorReady);
    if (!sponsorReady) return fail("Challenge opportunity was not found.", 404, undefined, "NOT_FOUND");
    const fundingWindow = validateSponsorFundingWindow(data);
    const placementFoundation = sponsorPlacementFoundation();
    const opportunity = {
      id: snap.id,
      title: data.title ?? "Untitled challenge",
      description: data.description ?? "Challenge overview pending.",
      creatorId: data.creatorId ?? null,
      creatorName: data.creatorName ?? "Creator details pending",
      participantCount: Number(data.participantCount ?? 0),
      category: data.category ?? null,
      targetAudience: data.targetAudience ?? null,
      sponsorshipPackages: Array.isArray(data.sponsorPackages) ? data.sponsorPackages : [],
      placements: Array.isArray(data.sponsorPlacementOptions) && data.sponsorPlacementOptions.length ? data.sponsorPlacementOptions : placementFoundation,
      estimatedReach: data.expectedReachLabel ?? null,
      sponsorshipBudget: data.minimumSponsorshipAmount ? `$${data.minimumSponsorshipAmount}` : null,
      currentPrizePoolCents: Number(data.confirmedSponsorContributionWinnerShareCents ?? data.confirmedSponsorContributionCents ?? data.visibleJackpotCents ?? 0),
      sponsorReady,
      fundingWindow,
      discussionFoundation: sponsorshipDiscussionFoundation(snap.id, context.user.uid),
      fundingSetupCopy: "Sponsor funding checkout creates a pending Stripe session only. Confirmed sponsor contributions are added 100% to the winner prize pool after webhook confirmation.",
      timeline: { startsAt: data.startsAt ?? null, endsAt: data.endsAt ?? null, votingDeadline: data.votingDeadline ?? null },
      riskIndicators: { adminReviewRequired: Boolean(data.adminReviewRequired), fundingEnabled: false },
      status: getChallengeDisplayStatus(data as any)
    };
    return ok({ opportunity }, "Challenge sponsorship opportunity loaded.");
  } catch (error) {
    console.error("[sponsor-discover-challenge:get]", { userId: context.user.uid, message: error instanceof Error ? error.message : String(error) });
    return serverError("Challenge opportunity could not be loaded.");
  }
}
