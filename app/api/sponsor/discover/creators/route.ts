import { FieldPath } from "firebase-admin/firestore";
import { requireSponsorContext } from "@/lib/server/sponsor";
import { resolveSponsorWorkspaceState } from "@/lib/sponsor-access";
import { fail, ok, serverError } from "@/lib/server/responses";

export const dynamic = "force-dynamic";

const PAGE_SIZE = 36;
const QUERY_PAGE_SIZE = 100;
const MAX_SCANNED_PER_REQUEST = 500;

function safeCreator(id: string, data: Record<string, unknown>) {
  const accountType = String(data.accountType ?? data.account_type ?? data.role ?? "").toLowerCase();
  const isCreator = ["creator", "host"].includes(accountType) || data.creatorProfileEnabled === true || data.canCreateChallenges === true;
  const profileComplete = Boolean(data.creatorProfileCompletedAt || data.profileCompletedAt || data.creatorProfileComplete || data.profileComplete || data.hasCreatorProfile);
  const sponsorReady = data.sponsorReadyEnabled === true || data.sponsorReady === true || data.acceptingSponsors === true || data.openToSponsors === true;
  const accountStatus = String(data.accountStatus ?? "active").toLowerCase();
  const hidden = data.profileVisibility === "private" || data.publicProfileHidden === true || data.discoverable === false;
  const disabled = ["disabled", "suspended", "banned", "deleted", "anonymized", "deletion_requested"].includes(accountStatus);
  const displayName = String(data.displayName ?? data.fullName ?? data.username ?? "").trim();
  if (!isCreator || !profileComplete || !sponsorReady || hidden || disabled || data.isAdmin === true || accountType === "admin" || !displayName) return null;
  return {
    id,
    displayName,
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
    sponsorVisible: true,
    profileComplete,
    sponsorReady
  };
}

function matchesSearch(creator: Record<string, unknown>, search: string) {
  if (!search) return true;
  return [creator.displayName, creator.username, creator.niche, creator.category, creator.location, creator.verificationStatus]
    .some((value) => String(value ?? "").toLocaleLowerCase().includes(search));
}

export async function GET(request: Request) {
  const { context, response } = await requireSponsorContext(request);
  if (response) return response;
  if (!context) return serverError("Sponsor access could not be verified.");
  const workspace = resolveSponsorWorkspaceState(context.sponsorProfile);
  if (!workspace.canDiscover) return fail(workspace.lockedReason || "Sponsor approval is required before discovering creators.", 403, { sponsorStatus: workspace.status }, "SPONSOR_DISCOVERY_LOCKED");
  try {
    const params = new URL(request.url).searchParams;
    const search = params.get("q")?.trim().toLocaleLowerCase().slice(0, 80) ?? "";
    const page = Math.max(1, Math.floor(Number(params.get("page") ?? 1) || 1));
    const cursorId = params.get("cursor")?.trim() ?? "";
    if (page > 1 && !cursorId) return fail("A cursor is required to continue creator discovery.", 400, undefined, "CREATOR_CURSOR_REQUIRED");
    const profiles = context.db.collection("profiles");
    let query = profiles.orderBy(FieldPath.documentId(), "asc");
    if (cursorId) {
      const cursor = await profiles.doc(cursorId).get();
      if (!cursor.exists) return fail("Creator discovery cursor is no longer available. Restart the search.", 400, undefined, "CREATOR_CURSOR_NOT_FOUND");
      query = query.startAfter(cursor);
    }

    const matches: Array<{ id: string; data: Record<string, unknown>; creator: Record<string, unknown> }> = [];
    let scanned = 0;
    let lastScannedId: string | null = null;
    let exhausted = false;
    while (scanned < MAX_SCANNED_PER_REQUEST && matches.length < PAGE_SIZE + 1) {
      const batchSize = Math.min(QUERY_PAGE_SIZE, MAX_SCANNED_PER_REQUEST - scanned);
      const snap = await query.limit(batchSize).get();
      if (snap.empty) { exhausted = true; break; }
      for (const doc of snap.docs) {
        scanned += 1;
        lastScannedId = doc.id;
        const data = doc.data() as Record<string, unknown>;
        const creator = safeCreator(doc.id, data);
        if (creator && matchesSearch(creator, search)) matches.push({ id: doc.id, data, creator });
        if (matches.length >= PAGE_SIZE + 1) break;
      }
      const lastDoc = snap.docs.at(-1);
      if (matches.length < PAGE_SIZE + 1) query = query.startAfter(lastDoc);
      if (snap.size < batchSize) { exhausted = true; break; }
    }

    const hasExtraMatch = matches.length > PAGE_SIZE;
    const creators = matches.slice(0, PAGE_SIZE).map(({ creator }) => creator);
    const nextCursor = hasExtraMatch ? matches[PAGE_SIZE - 1]?.id ?? null : exhausted ? null : lastScannedId;
    return ok({
      creators,
      filters: { search, searchSemantics: "case-insensitive contains across public creator name, username, niche, category, location, and verification label", metricsAreFoundation: true },
      pagination: { page, pageSize: PAGE_SIZE, total: null, totalPages: null, hasMore: Boolean(nextCursor), nextCursor }
    }, "Sponsor-safe creators loaded.");
  } catch (error) {
    console.error("[sponsor-discover-creators:get]", { userId: context.user.uid, message: error instanceof Error ? error.message : String(error) });
    return serverError("Creator discovery could not be loaded.");
  }
}
