import { NextRequest } from "next/server";
import { getOptionalRequestUser } from "@/lib/server/auth";
import { ok, serverError, serverUnavailable } from "@/lib/server/responses";
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

function isDefaultDiscoverable(challenge: Record<string, unknown>, phase: PhaseSummary) {
  const status = text(challenge.status ?? challenge.lifecycleStatus).toLowerCase();
  if (["draft", "cancelled", "canceled", "deleted", "rejected", "hidden", "admin_removed", "pending_review"].includes(status)) return false;
  if (["voting_closed", "completed", "cancelled", "draft", "pending_review"].includes(phase.phase)) return false;
  return true;
}

function trendScore(item: Record<string, unknown>) {
  const participantScore = Number(item.participantCount ?? 0) * 10;
  const voteScore = Number(item.voteCount ?? 0) * 4;
  const saveScore = Number(item.saveCount ?? item.savedCount ?? 0) * 3;
  const updatedAt = Date.parse(String(item.updatedAt ?? item.publishedAt ?? item.createdAt ?? "")) || 0;
  const freshnessScore = updatedAt ? Math.max(0, 1_000_000_000_000 - Math.max(0, Date.now() - updatedAt)) / 10_000_000_000 : 0;
  return participantScore + voteScore + saveScore + freshnessScore;
}

function sortChallenges(items: Array<Record<string, unknown>>, sort: string) {
  const byDate = (key: string, item: Record<string, unknown>) => Date.parse(String(item[key] ?? "")) || 0;
  const copy = [...items];
  if (sort === "participants") return copy.sort((a, b) => Number(b.participantCount ?? 0) - Number(a.participantCount ?? 0));
  if (sort === "ending_soon") return copy.sort((a, b) => byDate("submissionDeadline", a) - byDate("submissionDeadline", b));
  return copy.sort((a, b) => byDate("publishedAt", b) - byDate("publishedAt", a));
}

function ctaFor(input: { challenge: Record<string, unknown>; phase: PhaseSummary; userId: string | null; sponsor: boolean }) {
  const detailHref = `/challenges/${input.challenge.id}`;
  if (input.userId && ownedBy(input.challenge, input.userId)) return { label: "Manage Challenge", href: "/challenges", action: "manage" };
  if (input.sponsor) return { label: "View Challenge", href: detailHref, action: "view" };
  if (input.phase.phase === "winners_announced") return { label: "See Winners", href: detailHref, action: "winners" };
  if (input.phase.phase === "completed") return { label: "View Results", href: detailHref, action: "results" };
  if (input.phase.phase === "voting_closed") return hasResults(input.challenge) ? { label: "View Results", href: detailHref, action: "results" } : { label: "Voting Closed", href: detailHref, action: "closed", disabled: true };
  if (input.phase.canVote) return { label: "Vote Now", href: `${detailHref}/votes`, action: "vote" };
  if (input.phase.canSubmit) return { label: "Submit Entry", href: `${detailHref}/join`, action: "submit" };
  if (isPaidEntryChallenge(input.challenge) && input.phase.canJoin) {
    const fee = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(paidEntryAmountCents(input.challenge) / 100);
    return { label: `Pay & Enter - ${fee}`, href: detailHref, action: "pay" };
  }
  if (input.phase.canJoin) return { label: "Register", href: `${detailHref}/join`, action: "register" };
  return { label: "View Challenge", href: detailHref, action: "view" };
}

export async function GET(request: NextRequest) {
  const db = getAdminDb();
  if (!db) return serverUnavailable("Explore is not connected yet.");
  const user = await getOptionalRequestUser(request);
  const sponsor = isSponsorProfile(user ? { role: user.role } : {});
  const url = new URL(request.url);
  const query = text(url.searchParams.get("q")).slice(0, 80);
  const category = text(url.searchParams.get("category")).slice(0, 80).toLowerCase();
  const phaseFilter = text(url.searchParams.get("phase")).slice(0, 40).toLowerCase();
  const entry = text(url.searchParams.get("entry")).slice(0, 20).toLowerCase();
  const sort = text(url.searchParams.get("sort")).slice(0, 40).toLowerCase() || "recent";
  const page = Math.max(1, Number(url.searchParams.get("page") ?? 1) || 1);
  const limit = Math.min(48, Math.max(8, Number(url.searchParams.get("limit") ?? 24) || 24));
  try {
    const snap = await db.collection("challenges").orderBy("createdAt", "desc").limit(180).get();
    const all = snap.docs.flatMap((doc) => {
      const raw = { id: doc.id, ...doc.data() } as Record<string, unknown>;
      if (!isPublicChallenge(doc.id, raw)) return [];
      const phase = getChallengePhaseSummary(raw, new Date(), { eligibleSubmissionCount: Number(raw.approvedSubmissionCount ?? raw.eligibleSubmissionCount ?? 0) });
      if (!phaseFilter && !isDefaultDiscoverable(raw, phase)) return [];
      if (phaseFilter && phase.phase !== phaseFilter) return [];
      if (category && String(raw.category ?? "").toLowerCase() !== category) return [];
      if (entry === "free" && isPaidEntryChallenge(raw)) return [];
      if (entry === "paid" && !isPaidEntryChallenge(raw)) return [];
      const searchable = [raw.title, raw.shortDescription, raw.description, raw.category, raw.creatorName, raw.creatorUsername].map((value) => String(value ?? "").toLowerCase()).join(" ");
      if (query && !searchable.includes(query.toLowerCase())) return [];
      const publicFields = publicChallengeFields(raw);
      const paid = isPaidEntryChallenge(raw);
      const challenge = {
        ...publicFields,
        id: doc.id,
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
        paidEntry: { required: paid, amountCents: paid ? paidEntryAmountCents(raw) : 0, currency: "usd" },
        creator: { displayName: text(raw.creatorName ?? raw.creatorDisplayName) || "Challenge creator", username: text(raw.creatorUsername), avatarUrl: text(raw.creatorAvatarUrl ?? raw.creatorAvatar) },
        cta: ctaFor({ challenge: raw, phase, userId: user?.uid ?? null, sponsor })
      };
      return [challenge];
    });
    const sorted = sortChallenges(all, sort);
    const start = (page - 1) * limit;
    const items = sorted.slice(start, start + limit);
    const trending = [...all].sort((a, b) => trendScore(b) - trendScore(a)).slice(0, 8);
    const categories = Array.from(new Set(all.map((item) => String(item.category ?? "")).filter(Boolean))).slice(0, 12);
    return ok({ challenges: items, featured: trending, trending, categories, page, limit, total: sorted.length, hasMore: start + limit < sorted.length, filters: { q: query, category, phase: phaseFilter, entry, sort }, privateFieldsExcluded: true, realDataOnly: true, defaultClosedExcluded: !phaseFilter }, "Explore challenges loaded.");
  } catch (error) {
    return serverError("Explore challenges could not be loaded.", error instanceof Error ? error.message : error);
  }
}
