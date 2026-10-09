import { FieldPath } from "firebase-admin/firestore";
import { getChallengeDisplayStatus } from "@/lib/challenge-status";
import { requireSponsorContext } from "@/lib/server/sponsor";
import { resolveSponsorWorkspaceState } from "@/lib/sponsor-access";
import { fail, ok, serverError } from "@/lib/server/responses";
import { sponsorPlacementFoundation, validateSponsorFundingWindow } from "@/lib/server/payout-structure";

export const dynamic = "force-dynamic";
const PAGE_SIZE = 36;
const QUERY_PAGE_SIZE = 100;
const MAX_SCANNED_PER_REQUEST = 500;

function safeChallenge(id: string, data: Record<string, unknown>) {
  const visibility = String(data.visibility ?? "public").toLowerCase();
  if (!["public", "published"].includes(visibility) && visibility !== "public challenge") return null;
  const sponsorReady = data.sponsorEnabled === true || data.sponsorReady === true || (data.monetization as Record<string, unknown> | undefined)?.sponsorReady === true;
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
    fundable: fundingWindow.allowed,
    currentPrizePoolCents: Number(data.confirmedSponsorContributionWinnerShareCents ?? data.confirmedSponsorContributionCents ?? data.visibleJackpotCents ?? 0),
    sponsorPackages: Array.isArray(data.sponsorPackages) ? data.sponsorPackages : [],
    placements: Array.isArray(data.sponsorPlacementOptions) && data.sponsorPlacementOptions.length ? data.sponsorPlacementOptions : sponsorPlacementFoundation()
  };
}

function matchesSearch(challenge: Record<string, unknown>, search: string) {
  if (!search) return true;
  return [challenge.title, challenge.creatorName, challenge.category]
    .some((value) => String(value ?? "").toLocaleLowerCase().includes(search));
}

export async function GET(request: Request) {
  const { context, response } = await requireSponsorContext(request);
  if (response) return response;
  if (!context) return serverError("Sponsor access could not be verified.");
  const workspace = resolveSponsorWorkspaceState(context.sponsorProfile);
  if (!workspace.canDiscover) return fail(workspace.lockedReason || "Sponsor approval is required before discovering challenges.", 403, { sponsorStatus: workspace.status }, "SPONSOR_DISCOVERY_LOCKED");
  try {
    const params = new URL(request.url).searchParams;
    const search = params.get("q")?.trim().toLocaleLowerCase().slice(0, 80) ?? "";
    const page = Math.max(1, Math.floor(Number(params.get("page") ?? 1) || 1));
    const cursorId = params.get("cursor")?.trim() ?? "";
    if (page > 1 && !cursorId) return fail("A cursor is required to continue opportunity discovery.", 400, undefined, "SPONSOR_DISCOVERY_CURSOR_REQUIRED");
    const pageSize = PAGE_SIZE;
    const challengesRef = context.db.collection("challenges");
    let query = context.db.collection("challenges")
      .where("visibility", "==", "public")
      .where("status", "in", ["approved", "published", "scheduled", "registration_open", "active", "submission_open", "voting_open"])
      .orderBy("createdAt", "desc")
      .orderBy(FieldPath.documentId(), "desc");
    if (cursorId) {
      const cursorSnap = await challengesRef.doc(cursorId).get();
      if (!cursorSnap.exists) return fail("Opportunity pagination cursor is no longer available. Restart the search.", 400, undefined, "SPONSOR_DISCOVERY_CURSOR_NOT_FOUND");
      query = query.startAfter(cursorSnap);
    }
    const matches: Array<{ id: string; challenge: Record<string, unknown> }> = [];
    let scanned = 0;
    let lastScannedId: string | null = null;
    let exhausted = false;
    while (scanned < MAX_SCANNED_PER_REQUEST && matches.length < pageSize + 1) {
      const batchSize = Math.min(QUERY_PAGE_SIZE, MAX_SCANNED_PER_REQUEST - scanned);
      const snap = await query.limit(batchSize).get();
      if (snap.empty) { exhausted = true; break; }
      for (const doc of snap.docs) {
        scanned += 1;
        lastScannedId = doc.id;
        const challenge = safeChallenge(doc.id, doc.data() as Record<string, unknown>);
        if (challenge && matchesSearch(challenge, search)) matches.push({ id: doc.id, challenge });
        if (matches.length >= pageSize + 1) break;
      }
      const lastDoc = snap.docs.at(-1);
      if (matches.length < pageSize + 1) query = query.startAfter(lastDoc);
      if (snap.size < batchSize) { exhausted = true; break; }
    }
    const hasExtraMatch = matches.length > pageSize;
    const challenges = matches.slice(0, pageSize).map(({ challenge }) => challenge);
    const nextCursor = hasExtraMatch ? matches[pageSize - 1]?.id ?? null : exhausted ? null : lastScannedId;
    return ok({
      challenges,
      metricsAreEstimated: false,
      filters: { search, searchSemantics: "case-insensitive contains across public opportunity title, creator name, and category" },
      pagination: { page, pageSize, total: null, totalPages: null, hasMore: Boolean(nextCursor), nextCursor }
    }, "Sponsor-safe challenges loaded.");
  } catch (error) {
    console.error("[sponsor-discover-challenges:get]", { userId: context.user.uid, message: error instanceof Error ? error.message : String(error) });
    return serverError("Challenge discovery could not be loaded.");
  }
}

