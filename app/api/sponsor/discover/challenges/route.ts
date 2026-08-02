import { getChallengeDisplayStatus } from "@/lib/challenge-status";
import { requireSponsorContext } from "@/lib/server/sponsor";
import { resolveSponsorWorkspaceState } from "@/lib/sponsor-access";
import { fail, ok, serverError } from "@/lib/server/responses";
import { sponsorPlacementFoundation, validateSponsorFundingWindow } from "@/lib/server/payout-structure";

export const dynamic = "force-dynamic";

function safeChallenge(id: string, data: Record<string, unknown>) {
  const visibility = String(data.visibility ?? "public").toLowerCase();
  if (!["public", "published"].includes(visibility) && visibility !== "public challenge") return null;
  const sponsorReady = Boolean(data.sponsorEnabled || data.sponsorReady || (data.monetization as Record<string, unknown> | undefined)?.sponsorReady);
  if (!sponsorReady) return null;
  const fundingWindow = validateSponsorFundingWindow(data);
  return {
    id,
    title: data.title ?? "Untitled challenge",
    creatorId: data.creatorId ?? null,
    creatorName: data.creatorName ?? "Creator details pending",
    category: data.category ?? null,
    participantCount: Number(data.participantCount ?? 0),
    targetAudience: data.targetAudience ?? null,
    sponsorshipAmountLabel: sponsorReady && data.minimumSponsorshipAmount ? `$${data.minimumSponsorshipAmount}` : null,
    campaignDates: data.startsAt || data.endsAt ? `${data.startsAt ?? "Start not set"} to ${data.endsAt ?? "End not set"}` : null,
    expectedReach: data.expectedReachLabel ?? null,
    status: getChallengeDisplayStatus(data as any),
    sponsorReady,
    fundingWindow,
    currentPrizePoolCents: Number(data.confirmedSponsorContributionWinnerShareCents ?? data.confirmedSponsorContributionCents ?? data.visibleJackpotCents ?? 0),
    sponsorPackages: Array.isArray(data.sponsorPackages) ? data.sponsorPackages : [],
    placements: Array.isArray(data.sponsorPlacementOptions) && data.sponsorPlacementOptions.length ? data.sponsorPlacementOptions : sponsorPlacementFoundation()
  };
}

export async function GET(request: Request) {
  const { context, response } = await requireSponsorContext(request);
  if (response) return response;
  if (!context) return serverError("Sponsor access could not be verified.");
  const workspace = resolveSponsorWorkspaceState(context.sponsorProfile);
  if (!workspace.canDiscover) return fail(workspace.lockedReason || "Sponsor approval is required before discovering challenges.", 403, { sponsorStatus: workspace.status }, "SPONSOR_DISCOVERY_LOCKED");
  try {
    const search = new URL(request.url).searchParams.get("q")?.toLowerCase().trim() ?? "";
    const snap = await context.db.collection("challenges").limit(200).get();
    let challenges = snap.docs.flatMap((doc) => { const item = safeChallenge(doc.id, doc.data()); return item ? [item] : []; });
    if (search) challenges = challenges.filter((challenge) => [challenge.title, challenge.creatorName, challenge.category].some((value) => String(value).toLowerCase().includes(search)));
    return ok({ challenges: challenges.slice(0, 100), metricsAreEstimated: false }, "Sponsor-safe challenges loaded.");
  } catch (error) {
    console.error("[sponsor-discover-challenges:get]", { userId: context.user.uid, message: error instanceof Error ? error.message : String(error) });
    return serverError("Challenge discovery could not be loaded.");
  }
}

