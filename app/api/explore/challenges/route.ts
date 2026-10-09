import { NextRequest } from "next/server";
import { getOptionalRequestUser } from "@/lib/server/auth";
import { ok, serverError } from "@/lib/server/responses";
import { getChallengePhaseSummary, PUBLIC_CHALLENGE_STATUS_VALUES } from "@/lib/challenge-status";
import { isPaidEntryChallenge, paidEntryAmountCents } from "@/lib/server/monetization-payments";
import { isPublicChallenge, isQaOrDemoRecord, isRetiredHybridCompetition, publicChallengeFields } from "@/lib/server/public-challenge";
import { userOwnsChallenge } from "@/lib/server/challenge-access";
import { isSponsorProfile } from "@/lib/server/submission-lifecycle";
import { getAdminDb } from "@/lib/firebase/admin";
import { FieldPath, type QueryDocumentSnapshot } from "firebase-admin/firestore";
import { CHALLENGE_PAGE_SIZE } from "@/lib/challenge-pagination";
import { monthlyBoostRankingWeight } from "@/lib/monthly-boost";
import { NORMAL_CHALLENGE_CATEGORIES } from "@/lib/normal-challenge-config";

export const dynamic = "force-dynamic";
export const revalidate = 0;
const EXPLORE_SCAN_PAGE = 180;

type PhaseSummary = ReturnType<typeof getChallengePhaseSummary>;

function text(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function toIso(value: unknown) {
  if (!value) return null;
  if (value instanceof Date) return value.toISOString();
  if (typeof value === "object" && value && "toDate" in value && typeof (value as { toDate: () => Date }).toDate === "function") return (value as { toDate: () => Date }).toDate().toISOString();
  const date = new Date(String(value));
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function ownedBy(challenge: Record<string, unknown>, userId: string) {
  return userOwnsChallenge(challenge, userId) || [challenge.creatorId, challenge.hostId, challenge.ownerId, challenge.userId].some((value) => String(value ?? "") === userId);
}

function hasResults(challenge: Record<string, unknown>) {
  return Boolean(challenge.winnersAnnounced || challenge.resultsPublished || Number(challenge.winnerCount ?? 0) > 0 || Number(challenge.placementCount ?? 0) > 0);
}

function challengeType(challenge: Record<string, unknown>) {
  const type = text(challenge.type ?? challenge.competitionType).toLowerCase();
  if (challenge.isLiveEvent === true || type.includes("live event")) return "live_event";
  if (text(challenge.tournamentType).toLowerCase() !== "none" || type.includes("tournament")) return "tournament";
  if (text(challenge.visibility).toLowerCase() === "private" || type.includes("private")) return "private";
  return "standard";
}

function typeLabel(type: string) {
  return type === "private" ? "Private Challenge" : type === "live_event" ? "Live Event" : type === "tournament" ? "Tournament" : "Standard Challenge";
}

function completedWithinExploreWindow(challenge: Record<string, unknown>, phase: PhaseSummary) {
  if (!["completed", "winners_announced", "voting_closed"].includes(phase.phase) || !hasResults(challenge)) return false;
  const confirmedAt = Date.parse(String(challenge.resultsPublishedAt ?? challenge.winnersAnnouncedAt ?? challenge.completedAt ?? challenge.winnerAnnouncementAt ?? ""));
  return Number.isFinite(confirmedAt) && Date.now() - confirmedAt >= 0 && Date.now() - confirmedAt <= 5 * 60 * 1000;
}

function isDefaultDiscoverable(challenge: Record<string, unknown>, phase: PhaseSummary) {
  const status = text(challenge.status ?? challenge.lifecycleStatus).toLowerCase();
  if (["draft", "cancelled", "canceled", "deleted", "rejected", "hidden", "admin_removed", "pending_review"].includes(status)) return false;
  if (["completed", "winners_announced"].includes(phase.phase)) return completedWithinExploreWindow(challenge, phase);
  if (["cancelled", "draft", "pending_review"].includes(phase.phase)) return false;
  return true;
}

function isLockedPublicPreview(id: string, challenge: Record<string, unknown>) {
  const visibility = text(challenge.visibility).toLowerCase();
  const type = text(challenge.type ?? challenge.competitionType).toLowerCase();
  const status = text(challenge.status ?? challenge.lifecycleStatus).toLowerCase();
  return visibility === "private"
    && challenge.publicPreviewEnabled === true
    && challenge.publicVisibility !== false
    && challenge.eventVisibility !== "hidden_until_approved"
    && (PUBLIC_CHALLENGE_STATUS_VALUES as readonly string[]).includes(status)
    && !isQaOrDemoRecord(id, challenge)
    && !isRetiredHybridCompetition(challenge)
    && (type.includes("private") || type.includes("exclusive") || type.includes("invite"));
}

function cursorValue(challenge: Record<string, unknown>, field: string) {
  const value = challenge[field] as { toMillis?: () => number } | string | number | null | undefined;
  if (value && typeof value === "object" && typeof value.toMillis === "function") return value.toMillis();
  if (typeof value === "string") return Date.parse(value) || value;
  return value ?? 0;
}

function compareExploreDocs(left: QueryDocumentSnapshot, right: QueryDocumentSnapshot, field: string, direction: "asc" | "desc") {
  const leftValue = cursorValue(left.data() as Record<string, unknown>, field);
  const rightValue = cursorValue(right.data() as Record<string, unknown>, field);
  const comparison = typeof leftValue === "number" && typeof rightValue === "number" ? leftValue - rightValue : String(leftValue).localeCompare(String(rightValue));
  return (direction === "asc" ? comparison : -comparison) || left.id.localeCompare(right.id) * (direction === "asc" ? 1 : -1);
}

function trustedRecentActivity(item: Record<string, unknown>) {
  if (item.activityIntegrityStatus === "blocked" || item.suspiciousActivity === true || item.hiddenFromTrending === true) return null;
  const creatorActivity = Number(item.creatorSelfActivity72h ?? 0);
  const participants = Math.max(0, Number(item.uniqueParticipants72h ?? item.recentParticipantCount72h ?? item.participantCount ?? 0) - creatorActivity);
  const votes = Math.max(0, Number(item.verifiedUniqueVotes72h ?? item.recentVerifiedVoteCount72h ?? item.voteCount ?? 0));
  const views = Math.max(0, Number(item.uniqueChallengeViews72h ?? item.recentUniqueViewCount72h ?? 0));
  const saves = Math.max(0, Number(item.uniqueSaves72h ?? item.recentSaveCount72h ?? item.saveCount ?? item.savedCount ?? 0));
  const shares = Math.max(0, Number(item.uniqueShares72h ?? item.recentShareCount72h ?? 0));
  const comments = Math.max(0, Number(item.uniqueComments72h ?? item.recentCommentCount72h ?? 0));
  const createdAt = Date.parse(String(item.publishedAt ?? item.createdAt ?? ""));
  const fresh = Number.isFinite(createdAt) && Date.now() - createdAt >= 0 && Date.now() - createdAt <= 72 * 60 * 60 * 1000;
  const activityCount = participants + votes + views + saves + shares + comments;
  if (activityCount < 1 && !fresh) return null;
  const normalized = (value: number) => Math.min(value, 100) / 100;
  const score = normalized(participants) * 30
    + normalized(votes) * 25
    + normalized(views) * 15
    + normalized(saves) * 10
    + normalized(shares) * 10
    + normalized(comments) * 5
    + (fresh ? 5 : 0);
  const activityLabel = participants > 0 ? `${participants.toLocaleString()} joined`
    : votes > 0 ? `${votes.toLocaleString()} verified vote${votes === 1 ? "" : "s"}`
      : views > 0 ? `${views.toLocaleString()} recent view${views === 1 ? "" : "s"}`
        : fresh ? "New challenge" : "Active";
  return { score, activityLabel };
}

function withoutRankingSignals(item: Record<string, unknown>) {
  const { discoveryScore: _discoveryScore, trendingScore: _trendingScore, ...publicItem } = item;
  return publicItem;
}

function ctaFor(input: { challenge: Record<string, unknown>; phase: PhaseSummary; userId: string | null; sponsor: boolean; participant?: Record<string, unknown> }) {
  const detailHref = `/challenges/${input.challenge.id}`;
  const kind = challengeType(input.challenge);
  if (input.userId && ownedBy(input.challenge, input.userId)) return { label: "Manage Challenge", href: "/challenges", action: "manage" };
  if (input.sponsor) return { label: "View Challenge", href: detailHref, action: "view" };
  if (kind === "private") return { label: "Enter Access Code", href: detailHref, action: "access_code" };
  if (kind === "live_event") {
    if (["completed", "winners_announced"].includes(input.phase.phase)) return { label: "Event Completed", href: detailHref, action: "view" };
    if (!input.phase.registrationOpen) return { label: "View Event", href: detailHref, action: "view" };
    return isPaidEntryChallenge(input.challenge) ? { label: "Buy Ticket", href: detailHref, action: "ticket" } : { label: "Register for Event", href: detailHref, action: "register" };
  }
  if (kind === "tournament") {
    if (Boolean(input.challenge.bracketGeneratedAt)) return { label: "View Bracket", href: `/tournaments/${input.challenge.id}`, action: "bracket" };
    if (input.phase.registrationOpen) return { label: "Register", href: detailHref, action: "register" };
    return { label: "View Tournament", href: `/tournaments/${input.challenge.id}`, action: "view" };
  }
  if (input.phase.phase === "winners_announced") return { label: "View Winners", href: detailHref, action: "winners" };
  if (input.phase.phase === "completed") return { label: "View Results", href: detailHref, action: "results" };
  if (input.phase.phase === "voting_closed") return hasResults(input.challenge) ? { label: "View Results", href: detailHref, action: "results" } : { label: "Voting Closed", href: detailHref, action: "closed", disabled: true };
  if (input.phase.canVote) return { label: "Vote Now", href: `${detailHref}/votes`, action: "vote" };
  if (input.phase.canSubmit) return { label: "Submit Entry", href: `${detailHref}/join`, action: "submit" };
  if (input.participant) return { label: "Continue Challenge", href: detailHref, action: "continue" };
  if (isPaidEntryChallenge(input.challenge) && input.phase.canJoin) {
    const fee = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(paidEntryAmountCents(input.challenge) / 100);
    return { label: `Pay & Enter - ${fee}`, href: detailHref, action: "pay" };
  }
  if (input.phase.canJoin) return { label: "Join Challenge", href: `${detailHref}/join`, action: "register" };
  return { label: "View Challenge", href: detailHref, action: "view", reason: input.phase.label };
}

export async function GET(request: NextRequest) {
  const db = getAdminDb();
  if (!db) return ok({ challenges: [], featured: [], trending: [], categories: [], page: 1, limit: CHALLENGE_PAGE_SIZE, total: 0, hasMore: false, filters: {}, privateFieldsExcluded: true, realDataOnly: true, backendAvailable: false, reason: "backend_not_configured" }, "Explore is temporarily unavailable while the challenge service is being connected.");
  const user = await getOptionalRequestUser(request);
  const sponsor = isSponsorProfile(user ? { role: user.role } : {});
  const url = new URL(request.url);
  const query = text(url.searchParams.get("q")).slice(0, 80);
  const category = text(url.searchParams.get("category")).slice(0, 80).toLowerCase();
  const phaseFilter = text(url.searchParams.get("phase")).slice(0, 40).toLowerCase();
  const entry = text(url.searchParams.get("entry")).slice(0, 20).toLowerCase();
  const typeFilter = text(url.searchParams.get("type")).slice(0, 24).toLowerCase();
  const sponsorReady = url.searchParams.get("sponsorReady") === "true";
  const sort = text(url.searchParams.get("sort")).slice(0, 40).toLowerCase() || "recent";
  const page = Math.max(1, Number(url.searchParams.get("page") ?? 1) || 1);
  const cursor = text(url.searchParams.get("cursor")).slice(0, 200);
  const limit = CHALLENGE_PAGE_SIZE;
  if (page > 1 && !cursor) return serverError("Explore requires a cursor to continue this filtered result set.", "EXPLORE_CURSOR_REQUIRED");
  try {
    const sortField = sort === "participants" ? "participantCount" : sort === "ending_soon" ? "submissionDeadline" : "createdAt";
    const sortDirection = sort === "ending_soon" ? "asc" as const : "desc" as const;
    const challengesRef = db.collection("challenges");
    const orderQuery = (visibility: "public" | "private") => {
      let query = challengesRef
        .where("visibility", "==", visibility)
        .where("status", "in", PUBLIC_CHALLENGE_STATUS_VALUES)
        .orderBy(sortField, sortDirection)
        .orderBy(FieldPath.documentId(), sortDirection);
      if (visibility === "private") query = query.where("publicPreviewEnabled", "==", true);
      return query;
    };
    let publicQuery = orderQuery("public");
    let lockedQuery = orderQuery("private");
    if (cursor) {
      const cursorSnapshot = await challengesRef.doc(cursor).get();
      if (!cursorSnapshot.exists) return serverError("Explore pagination cursor is no longer available.", "EXPLORE_CURSOR_NOT_FOUND");
      publicQuery = publicQuery.startAfter(cursorSnapshot);
      lockedQuery = lockedQuery.startAfter(cursorSnapshot);
    }
    const [publicSnap, lockedSnap, participantSnap] = await Promise.all([
      publicQuery.limit(EXPLORE_SCAN_PAGE + 1).get(),
      lockedQuery.limit(EXPLORE_SCAN_PAGE + 1).get(),
      user ? db.collection("challengeParticipants").where("userId", "==", user.uid).limit(200).get() : Promise.resolve(null)
    ]);
    const candidateDocs = [...new Map([...publicSnap.docs, ...lockedSnap.docs].map((doc) => [doc.id, doc])).values()]
      .sort((left, right) => compareExploreDocs(left, right, sortField, sortDirection))
      .slice(0, EXPLORE_SCAN_PAGE * 2);
    const participantByChallenge = new Map((participantSnap?.docs ?? []).map((doc) => [String(doc.data().challengeId ?? ""), { id: doc.id, ...doc.data() }]));
    const all = candidateDocs.flatMap<Record<string, unknown> & { _sortDocId: string }>((doc) => {
      const raw = { id: doc.id, ...doc.data() } as Record<string, unknown>;
      const lockedPreview = isLockedPublicPreview(doc.id, raw);
      if (!lockedPreview && !isPublicChallenge(doc.id, raw)) return [];
      const phase = getChallengePhaseSummary(raw, new Date(), { eligibleSubmissionCount: Number(raw.approvedSubmissionCount ?? raw.eligibleSubmissionCount ?? 0) });
      if (!isDefaultDiscoverable(raw, phase)) return [];
      if (phaseFilter && phase.phase !== phaseFilter) return [];
      if (category && String(raw.category ?? "").toLowerCase() !== category) return [];
      if (entry === "free" && isPaidEntryChallenge(raw)) return [];
      if (entry === "paid" && !isPaidEntryChallenge(raw)) return [];
      const kind = challengeType(raw);
      if (typeFilter && kind !== typeFilter) return [];
      if (sponsorReady && !Boolean(raw.sponsorReady ?? raw.sponsorEnabled ?? (raw.monetization as Record<string, unknown> | undefined)?.sponsorReady)) return [];
      const searchable = (lockedPreview
        ? [raw.title, raw.shortDescription, raw.category, raw.creatorName, raw.creatorUsername]
        : [raw.title, raw.shortDescription, raw.description, raw.category, raw.creatorName, raw.creatorUsername, ...(Array.isArray(raw.keywords) ? raw.keywords : []), ...(Array.isArray(raw.tags) ? raw.tags : [])])
        .map((value) => String(value ?? "").toLowerCase()).join(" ");
      if (query && !searchable.includes(query.toLowerCase())) return [];
      if (lockedPreview) {
        const item = {
          id: doc.id,
          title: text(raw.title) || "Private Challenge",
          shortDescription: text(raw.shortDescription ?? raw.summary),
          category: text(raw.category) || "General",
          type: raw.type ?? "Private / Exclusive",
          visibility: "private",
          publicPreviewEnabled: true,
          challengeType: "private",
          typeLabel: typeLabel("private"),
          coverImageUrl: text(raw.coverImageUrl ?? raw.bannerUrl) || null,
          publishedAt: toIso(raw.publishedAt ?? raw.createdAt),
          creator: { displayName: text(raw.creatorName ?? raw.creatorDisplayName) || "Challenge creator", username: text(raw.creatorUsername), avatarUrl: text(raw.creatorAvatarUrl ?? raw.creatorAvatar) },
          phaseSummary: phase,
          completedRecently: completedWithinExploreWindow(raw, phase),
          completedInteractionsDisabled: true,
          detailHref: `/challenges/${doc.id}`,
          cta: { label: "View Locked Challenge", href: `/challenges/${doc.id}`, action: "locked_preview" }
        };
        return [{ ...item, _sortDocId: doc.id }];
      }
      const publicFields = publicChallengeFields(raw);
      const paid = isPaidEntryChallenge(raw);
      const owned = Boolean(user?.uid && ownedBy(raw, user.uid));
      const recentCompletion = completedWithinExploreWindow(raw, phase);
      const trend = trustedRecentActivity(raw);
      const challenge = {
        ...publicFields,
        id: doc.id,
        challengeType: kind,
        typeLabel: typeLabel(kind),
        detailHref: `/challenges/${doc.id}`,
        title: text(publicFields.title ?? raw.title) || "Untitled challenge",
        shortDescription: text(raw.shortDescription ?? raw.summary),
        coverImageUrl: text(raw.coverImageUrl ?? raw.bannerUrl ?? raw.mediaUrl),
        category: text(raw.category) || "General",
        publishedAt: toIso(raw.publishedAt ?? raw.createdAt),
        updatedAt: toIso(raw.updatedAt ?? raw.publishedAt ?? raw.createdAt),
        registrationDeadline: toIso(raw.registrationDeadline ?? raw.registrationEndAt ?? raw.registrationClosesAt) ?? raw.registrationDeadline,
        submissionDeadline: toIso(raw.submissionDeadline ?? raw.submissionEndAt ?? raw.submissionClosesAt) ?? raw.submissionDeadline,
        participantCount: raw.hideParticipantList === true ? null : Number(raw.participantCount ?? raw.participants ?? 0),
        voteCount: raw.hideVoteTotals === true ? null : Number(raw.voteCount ?? 0),
        participantCountVisible: raw.hideParticipantList !== true,
        voteTotalsVisible: raw.hideVoteTotals !== true,
        saveCount: Number(raw.saveCount ?? raw.savedCount ?? 0),
        phaseSummary: phase,
        hasResults: hasResults(raw),
        completedRecently: recentCompletion,
        completedInteractionsDisabled: ["completed", "winners_announced", "voting_closed"].includes(phase.phase),
        isOwnedByViewer: owned,
        trendingScore: (trend?.score ?? 0) + monthlyBoostRankingWeight(raw),
        discoveryScore: (trend?.score ?? 0) + monthlyBoostRankingWeight(raw),
        activityLabel: trend?.activityLabel ?? null,
        paidEntry: { required: paid, amountCents: paid ? paidEntryAmountCents(raw) : 0, currency: "usd" },
        creator: { displayName: text(raw.creatorName ?? raw.creatorDisplayName) || "Challenge creator", username: text(raw.creatorUsername), avatarUrl: text(raw.creatorAvatarUrl ?? raw.creatorAvatar) },
        cta: ctaFor({ challenge: raw, phase, userId: user?.uid ?? null, sponsor, participant: participantByChallenge.get(doc.id) })
      };
      return [{ ...challenge, _sortDocId: doc.id }];
    });
    const pageItems = all.slice(0, limit);
    const hasExtraMatch = all.length > limit;
    const hasMoreCandidates = publicSnap.size > EXPLORE_SCAN_PAGE || lockedSnap.size > EXPLORE_SCAN_PAGE || candidateDocs.length < publicSnap.size + lockedSnap.size;
    const hasMore = hasExtraMatch || hasMoreCandidates;
    const nextCursor = hasExtraMatch
      ? String(pageItems.at(-1)?._sortDocId ?? "")
      : hasMoreCandidates ? candidateDocs.at(-1)?.id ?? "" : null;
    const items = pageItems.map((item) => {
      const { _sortDocId: _cursorId, ...publicItem } = item;
      return withoutRankingSignals(publicItem);
    });
    const trending = all.filter((item) => Number(item.trendingScore ?? 0) > 0 && !item.completedInteractionsDisabled)
      .sort((a, b) => Number(b.trendingScore ?? 0) - Number(a.trendingScore ?? 0))
      .slice(0, 12)
      .map((item) => { const { _sortDocId: _cursorId, ...publicItem } = item; return withoutRankingSignals(publicItem); });
    const categories = NORMAL_CHALLENGE_CATEGORIES.map((item) => item.label);
    return ok({ challenges: items, featured: trending, trending, categories, page, limit, total: null, hasMore, nextCursor: nextCursor || null, filters: { q: query, category, phase: phaseFilter, entry, type: typeFilter, sort, sponsorReady }, privateFieldsExcluded: true, realDataOnly: true, defaultClosedExcluded: true, cursorPagination: true, scannedPageLimit: EXPLORE_SCAN_PAGE * 2, lockedPrivatePreviewsIncluded: true }, "Explore challenges loaded.");
  } catch (error) {
    return serverError("Explore challenges could not be loaded.", error instanceof Error ? error.message : error);
  }
}
