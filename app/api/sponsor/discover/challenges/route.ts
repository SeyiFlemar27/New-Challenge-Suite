import { getChallengeDisplayStatus } from "@/lib/challenge-status";
import { requireSponsorContext } from "@/lib/server/sponsor";
import { ok, serverError } from "@/lib/server/responses";

export const dynamic = "force-dynamic";

function safeChallenge(id: string, data: Record<string, unknown>) {
  const visibility = String(data.visibility ?? "public").toLowerCase();
  if (!["public", "published"].includes(visibility) && visibility !== "public challenge") return null;
  const sponsorReady = Boolean(data.sponsorEnabled || data.sponsorSlots || data.sponsorPackages || data.minimumSponsorshipAmount);
  return {
    id,
    title: data.title ?? "Untitled challenge",
    creatorId: data.creatorId ?? null,
    creatorName: data.creatorName ?? "Creator details pending",
    category: data.category ?? "Not available yet",
    participantCount: Number(data.participantCount ?? 0),
    targetAudience: data.targetAudience ?? "Target audience foundation pending",
    sponsorshipAmountLabel: sponsorReady ? data.minimumSponsorshipAmount ? `$${data.minimumSponsorshipAmount}` : "Requested amount foundation" : "Not requested yet",
    campaignDates: `${data.startsAt ?? "Start pending"} to ${data.endsAt ?? "End pending"}`,
    expectedReach: data.expectedReachLabel ?? "Estimated reach foundation only",
    status: getChallengeDisplayStatus(data as any),
    sponsorReady,
    sponsorPackages: Array.isArray(data.sponsorPackages) ? data.sponsorPackages : [],
    placements: Array.isArray(data.sponsorPlacementOptions) ? data.sponsorPlacementOptions : []
  };
}

export async function GET(request: Request) {
  const { context, response } = await requireSponsorContext(request);
  if (response) return response;
  if (!context) return serverError("Sponsor access could not be verified.");
  try {
    const search = new URL(request.url).searchParams.get("q")?.toLowerCase().trim() ?? "";
    const snap = await context.db.collection("challenges").limit(200).get();
    let challenges = snap.docs.flatMap((doc) => { const item = safeChallenge(doc.id, doc.data()); return item ? [item] : []; });
    if (search) challenges = challenges.filter((challenge) => [challenge.title, challenge.creatorName, challenge.category].some((value) => String(value).toLowerCase().includes(search)));
    return ok({ challenges: challenges.slice(0, 100), metricsAreEstimated: true }, "Sponsor-safe challenges loaded.");
  } catch (error) {
    console.error("[sponsor-discover-challenges:get]", { userId: context.user.uid, message: error instanceof Error ? error.message : String(error) });
    return serverError("Challenge discovery could not be loaded.");
  }
}

