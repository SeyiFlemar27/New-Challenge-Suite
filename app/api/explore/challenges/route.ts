import { NextRequest } from "next/server";
import { getOptionalRequestUser } from "@/lib/server/auth";
import { ok, serverError } from "@/lib/server/responses";
import { getChallengePhaseSummary } from "@/lib/challenge-status";
import { isPaidEntryChallenge, paidEntryAmountCents } from "@/lib/server/monetization-payments";
import { isPublicChallenge, publicChallengeFields } from "@/lib/server/public-challenge";
import { userOwnsChallenge } from "@/lib/server/challenge-access";
import { isSponsorProfile } from "@/lib/server/submission-lifecycle";
import { getAdminDb } from "@/lib/firebase/admin";

export const dynamic = "force-dynamic";
export const revalidate = 0;

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
  return Number.isFinite(confirmedAt) && Date.now() - confirmedAt >= 0 && Date.now() - confirmedAt <= 24 * 60 * 60 * 1000;
}

function isDefaultDiscoverable(challenge: Record<string, unknown>, phase: PhaseSummary) {
  const status = text(challenge.status ?? challenge.lifecycleStatus).toLowerCase();
  if (["draft", "cancelled", "canceled", "deleted", "rejected", "hidden", "admin_removed", "pending_review"].includes(status)) return false;
  if (["voting_closed", "completed", "winners_announced"].includes(phase.phase)) return completedWithinExploreWindow(challenge, phase);
  if (["cancelled", "draft", "pending_review"].includes(phase.phase)) return false;
  return true;
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

function sortChallenges(items: Array<Record<string, unknown>>, sort: string) {
  const byDate = (key: string, item: Record<string, unknown>) => Date.parse(String(item[key] ?? "")) || 0;
  const copy = [...items];
  if (sort === "participants") return copy.sort((a, b) => Number(b.participantCount ?? 0) - Number(a.participantCount ?? 0));
  if (sort === "ending_soon") return copy.sort((a, b) => byDate("submissionDeadline", a) - byDate("submissionDeadline", b));
  return copy.sort((a, b) => byDate("publishedAt", b) - byDate("publishedAt", a));
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
  if (!db) return ok({ challenges: [], featured: [], trending: [], categories: [], page: 1, limit: 24, total: 0, hasMore: false, filters: {}, privateFieldsExcluded: true, realDataOnly: true, backendAvailable: false, reason: "backend_not_configured" }, "Explore is temporarily unavailable while the challenge service is being connected.");
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
  const limit = Math.min(48, Math.max(8, Number(url.searchParams.get("limit") ?? 24) || 24));
  try {
    const [snap, participantSnap] = await Promise.all([
      db.collection("challenges").orderBy("createdAt", "desc").limit(180).get(),
      user ? db.collection("challengeParticipants").where("userId", "==", user.uid).limit(200).get() : Promise.resolve(null)
    ]);
    const participantByChallenge = new Map((participantSnap?.docs ?? []).map((doc) => [String(doc.data().challengeId ?? ""), { id: doc.id, ...doc.data() }]));
    const all = snap.docs.flatMap((doc) => {
      const raw = { id: doc.id, ...doc.data() } as Record<string, unknown>;
      if (!isPublicChallenge(doc.id, raw)) return [];
      const phase = getChallengePhaseSummary(raw, new Date(), { eligibleSubmissionCount: Number(raw.approvedSubmissionCount ?? raw.eligibleSubmissionCount ?? 0) });
      if (!phaseFilter && !isDefaultDiscoverable(raw, phase)) return [];
      if (phaseFilter && phase.phase !== phaseFilter) return [];
      if (category && String(raw.category ?? "").toLowerCase() !== category) return [];
      if (entry === "free" && isPaidEntryChallenge(raw)) return [];
      if (entry === "paid" && !isPaidEntryChallenge(raw)) return [];
      const kind = challengeType(raw);
      if (typeFilter && kind !== typeFilter) return [];
      if (sponsorReady && !Boolean(raw.sponsorReady ?? raw.sponsorEnabled ?? (raw.monetization as Record<string, unknown> | undefined)?.sponsorReady)) return [];
      const searchable = [raw.title, raw.shortDescription, raw.description, raw.category, raw.creatorName, raw.creatorUsername, ...(Array.isArray(raw.keywords) ? raw.keywords : []), ...(Array.isArray(raw.tags) ? raw.tags : [])].map((value) => String(value ?? "").toLowerCase()).join(" ");
      if (query && !searchable.includes(query.toLowerCase())) return [];
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
        participantCount: Number(raw.participantCount ?? raw.participants ?? 0),
        voteCount: Number(raw.voteCount ?? 0),
        saveCount: Number(raw.saveCount ?? raw.savedCount ?? 0),
        phaseSummary: phase,
        hasResults: hasResults(raw),
        completedRecently: recentCompletion,
        completedInteractionsDisabled: ["completed", "winners_announced", "voting_closed"].includes(phase.phase),
        isOwnedByViewer: owned,
        trendingScore: trend?.score ?? null,
        activityLabel: trend?.activityLabel ?? null,
        paidEntry: { required: paid, amountCents: paid ? paidEntryAmountCents(raw) : 0, currency: "usd" },
        creator: { displayName: text(raw.creatorName ?? raw.creatorDisplayName) || "Challenge creator", username: text(raw.creatorUsername), avatarUrl: text(raw.creatorAvatarUrl ?? raw.creatorAvatar) },
        cta: ctaFor({ challenge: raw, phase, userId: user?.uid ?? null, sponsor, participant: participantByChallenge.get(doc.id) })
      };
      return [challenge];
    });
    const sorted = sortChallenges(all, sort);
    const start = (page - 1) * limit;
    const items = sorted.slice(start, start + limit);
    const trending = all.filter((item) => Number(item.trendingScore ?? 0) > 0 && !item.completedInteractionsDisabled)
      .sort((a, b) => Number(b.trendingScore ?? 0) - Number(a.trendingScore ?? 0))
      .slice(0, 12);
    const categories = Array.from(new Set(all.map((item) => String(item.category ?? "")).filter(Boolean))).slice(0, 12);
    return ok({ challenges: items, featured: trending, trending, categories, page, limit, total: sorted.length, hasMore: start + limit < sorted.length, filters: { q: query, category, phase: phaseFilter, entry, type: typeFilter, sort, sponsorReady }, privateFieldsExcluded: true, realDataOnly: true, defaultClosedExcluded: !phaseFilter }, "Explore challenges loaded.");
  } catch (error) {
    return serverError("Explore challenges could not be loaded.", error instanceof Error ? error.message : error);
  }
}
