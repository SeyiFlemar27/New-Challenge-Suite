import { getAdminDb } from "@/lib/firebase/admin";
import { requireRequestUser } from "@/lib/server/auth";
import { fail, ok, serverError, serverUnavailable } from "@/lib/server/responses";
import { CHALLENGE_PAGE_SIZE } from "@/lib/challenge-pagination";
import { monthlyBoostRankingWeight } from "@/lib/monthly-boost";

export const dynamic = "force-dynamic";

const DISCOVERABLE = new Set(["approved", "published", "scheduled", "registration_not_open", "registration_open", "active", "submission_open", "submission_closed", "voting_open", "voting_closed", "under_review", "winners_announced", "completed"]);

function text(value: unknown, fallback = "") { return typeof value === "string" && value.trim() ? value.trim() : fallback; }
function kindOf(data: Record<string, unknown>) {
  const type = text(data.challengeType ?? data.type ?? data.competitionType).toLowerCase();
  const visibility = text(data.visibility).toLowerCase();
  if (type.includes("private") || visibility === "private" || visibility === "exclusive") return "private";
  if (type.includes("live") || data.isLiveEvent === true) return "live";
  const tournamentType = text(data.tournamentType).toLowerCase();
  if (type.includes("tournament") || (tournamentType && tournamentType !== "none")) return "tournament";
  return "normal";
}
function discoverable(data: Record<string, unknown>) {
  const status = text(data.status ?? data.lifecycleStatus).toLowerCase();
  return DISCOVERABLE.has(status) && data.deleted !== true && data.publicVisibility !== false;
}
function ownerId(data: Record<string, unknown>) { return text(data.creatorId ?? data.ownerId ?? data.hostId ?? data.userId); }
function publicRecord(id: string, data: Record<string, unknown>, kind: string, creatorDisplayName: string, currentUserId: string) {
  const images = Array.isArray(data.challengeImages) ? data.challengeImages.map((item) => typeof item === "string" ? item : item && typeof item === "object" ? text((item as Record<string, unknown>).url) : "").filter(Boolean).slice(0, 3) : [];
  return {
    id,
    challengeId: text(data.challengeId) || id,
    title: text(data.title ?? data.name, "Untitled challenge"),
    description: text(data.shortDescription ?? data.description),
    category: text(data.category, "Challenge"),
    challengeType: kind,
    typeLabel: kind === "private" ? "Private Challenge" : kind === "live" ? "Live Event Challenge" : "Tournament Challenge",
    status: text(data.status ?? data.lifecycleStatus, "scheduled"),
    coverImageUrl: text(data.coverImageUrl ?? data.imageUrl ?? data.image ?? data.mediaUrl) || images[0] || "",
    challengeImages: images,
    videoUrl: text(data.trailerVideoUrl ?? data.promoVideoUrl ?? data.videoUrl),
    creatorDisplayName,
    creatorId: ownerId(data),
    isOwned: ownerId(data) === currentUserId,
    participantCount: Number(data.participantCount ?? data.registrationCount ?? data.attending ?? 0),
    maxParticipants: Number(data.maxParticipants ?? data.capacity ?? 0),
    startsAt: data.startsAt ?? data.eventStartAt ?? null,
    registrationDeadline: data.registrationDeadline ?? data.registrationEndAt ?? null,
    prizeSummary: text(data.prizeTitle ?? data.prizeDescription),
    accessRequired: kind === "private",
    accessMethod: kind === "private" ? "Link + Code" : null,
    venueName: kind === "live" ? text(data.venueName ?? data.location) : null,
    tournamentFormat: kind === "tournament" ? text(data.format ?? data.tournamentFormat ?? data.tournamentType) : null
  };
}

export async function GET(request: Request) {
  const { user, response } = await requireRequestUser(request);
  if (response) return response;
  const db = getAdminDb();
  if (!db) return serverUnavailable("Challenge discovery");
    const url = new URL(request.url);
    const kind = url.searchParams.get("type") ?? "";
    const page = Math.max(1, Number(url.searchParams.get("page") ?? 1) || 1);
  if (!["private", "live", "tournament"].includes(kind)) return fail("A supported challenge discovery type is required.", 400, undefined, "DISCOVERY_TYPE_INVALID");
  try {
    const [userSnap, profileSnap] = await Promise.all([db.collection("users").doc(user.uid).get(), db.collection("profiles").doc(user.uid).get()]);
    const account = { ...(userSnap.data() ?? {}), ...(profileSnap.data() ?? {}) } as Record<string, unknown>;
    const roles = [account.selectedAccountType, account.role, account.accountType, account.planId, ...(Array.isArray(account.workspaceTypes) ? account.workspaceTypes : [])].map((value) => text(value).toLowerCase());
    const isHost = roles.includes("host");
    const isCreator = roles.includes("creator");
    const forbiddenCode = kind === "private" ? "PRIVATE_DISCOVERY_FORBIDDEN" : kind === "live" ? "LIVE_EVENT_DISCOVERY_FORBIDDEN" : "TOURNAMENT_DISCOVERY_FORBIDDEN";
    if (kind === "private" ? !isHost && !isCreator : !isHost) return fail("This discovery workspace is not available for your account type.", 403, undefined, forbiddenCode);

    const challengeQueries = kind === "private"
      ? [db.collection("challenges").where("visibility", "in", ["private", "exclusive"]).get(), db.collection("challenges").where("challengeType", "==", "private").get()]
      : kind === "live"
        ? [db.collection("challenges").where("isLiveEvent", "==", true).get(), db.collection("challenges").where("challengeType", "==", "live_event").get()]
        : [db.collection("challenges").where("challengeType", "==", "tournament").get()];
    const challengeSnaps = await Promise.all(challengeQueries);
    const records: Array<{ id: string; data: Record<string, unknown> }> = challengeSnaps.flatMap((snapshot) => snapshot.docs.map((doc) => ({ id: doc.id, data: doc.data() as Record<string, unknown> })));
    if (kind === "live") {
      const liveSnap = await db.collection("liveEvents").get();
      records.push(...liveSnap.docs.map((doc) => ({ id: doc.id, data: doc.data() as Record<string, unknown> })));
    }
    if (kind === "tournament") {
      const tournamentSnap = await db.collection("tournaments").get();
      records.push(...tournamentSnap.docs.map((doc) => ({ id: doc.id, data: doc.data() as Record<string, unknown> })));
    }
    const filtered = [...new Map(records.filter((item) => kindOf(item.data) === kind && discoverable(item.data)).map((item) => [item.id, item])).values()];
    const creatorIds = [...new Set(filtered.map((item) => ownerId(item.data)).filter(Boolean))];
    const profileSnaps = creatorIds.length ? await db.getAll(...creatorIds.map((id) => db.collection("profiles").doc(id))) : [];
    const profiles = new Map(profileSnaps.map((snap) => [snap.id, snap.data() ?? {}]));
    const challenges = filtered.map((item) => {
      const profile = profiles.get(ownerId(item.data)) ?? {};
      const fullName = [profile.firstName, profile.lastName].map((value) => text(value)).filter(Boolean).join(" ");
      const displayName = [profile.displayName, profile.name, fullName, profile.username, item.data.creatorName, item.data.hostName].map((value) => text(value)).find(Boolean) ?? "Challenge creator";
      return { ...publicRecord(item.id, item.data, kind, displayName, user.uid), rankingScore: monthlyBoostRankingWeight(item.data) };
    }).sort((left, right) => Number(right.rankingScore) - Number(left.rankingScore) || String(left.startsAt ?? "").localeCompare(String(right.startsAt ?? "")));
    const start = (page - 1) * CHALLENGE_PAGE_SIZE;
    return ok({ challenges: challenges.slice(start, start + CHALLENGE_PAGE_SIZE).map(({ rankingScore: _rankingScore, ...challenge }) => challenge), type: kind, total: challenges.length, page, limit: CHALLENGE_PAGE_SIZE, hasMore: start + CHALLENGE_PAGE_SIZE < challenges.length }, "Challenge discovery loaded.");
  } catch (error) {
    return serverError("Challenge discovery could not be loaded.", error instanceof Error ? error.message : error);
  }
}
