import { getAdminDb } from "@/lib/firebase/admin";
import { getOptionalRequestUser } from "@/lib/server/auth";
import { ok, serverError, serverUnavailable } from "@/lib/server/responses";
import { getChallengePhaseSummary } from "@/lib/challenge-status";
import { isPaidEntryChallenge, paidEntryAmountCents } from "@/lib/server/monetization-payments";
import { isPublicChallenge, publicChallengeFields } from "@/lib/server/public-challenge";
import { userOwnsChallenge } from "@/lib/server/challenge-access";
import { isSponsorProfile } from "@/lib/server/submission-lifecycle";

export const dynamic = "force-dynamic";

function toIso(value: unknown): string | null {
  if (!value) return null;
  if (typeof value === "string") return value;
  if (value instanceof Date) return value.toISOString();
  if (typeof value === "object" && value && "toDate" in value && typeof value.toDate === "function") return value.toDate().toISOString();
  return null;
}

function text(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function includesText(challenge: Record<string, unknown>, query: string) {
  if (!query) return true;
  const haystack = [challenge.title, challenge.description, challenge.category, challenge.type, challenge.creatorName, challenge.creatorUsername].map((item) => String(item ?? "").toLowerCase()).join(" ");
  return haystack.includes(query.toLowerCase());
}

function ownedBy(challenge: Record<string, unknown>, userId: string) {
  return userOwnsChallenge(challenge, userId) || [challenge.userId, challenge.ownerId, challenge.creatorId, challenge.hostId, challenge.createdBy, challenge.createdByUserId].some((value) => String(value ?? "") === userId);
}

function sortChallenges(items: Array<Record<string, unknown>>, sort: string) {
  const byDate = (key: string, item: Record<string, unknown>) => Date.parse(String(item[key] ?? "")) || 0;
  if (sort === "participants") return items.sort((a, b) => Number(b.participantCount ?? 0) - Number(a.participantCount ?? 0));
  if (sort === "ending_soon") return items.sort((a, b) => byDate("submissionDeadline", a) - byDate("submissionDeadline", b));
  return items.sort((a, b) => byDate("publishedAt", b) - byDate("publishedAt", a));
}

function ctaFor(input: { challenge: Record<string, unknown>; phase: ReturnType<typeof getChallengePhaseSummary>; userId: string | null; sponsor: boolean }) {
  if (input.userId && ownedBy(input.challenge, input.userId)) return { label: "Manage Challenge", href: "/challenges", action: "manage" };
  if (input.sponsor) return { label: "View Challenge", href: `/challenges/${input.challenge.id}`, action: "view" };
  if (input.phase.phase === "completed" || input.phase.phase === "winners_announced") return { label: "View Results", href: `/challenges/${input.challenge.id}`, action: "results" };
  if (input.phase.canVote) return { label: "View Voting", href: `/challenges/${input.challenge.id}/votes`, action: "vote" };
  if (isPaidEntryChallenge(input.challenge)) return { label: `Pay & Enter`, href: `/challenges/${input.challenge.id}`, action: "pay" };
  if (input.phase.canJoin) return { label: "Register", href: `/challenges/${input.challenge.id}/join`, action: "register" };
  if (input.phase.canSubmit) return { label: "View Challenge", href: `/challenges/${input.challenge.id}`, action: "view" };
  return { label: "View Challenge", href: `/challenges/${input.challenge.id}`, action: "view" };
}

export async function GET(request: Request) {
  const db = getAdminDb();
  if (!db) return serverUnavailable("Explore");
  const url = new URL(request.url);
  const query = text(url.searchParams.get("q")).slice(0, 80);
  const category = text(url.searchParams.get("category")).slice(0, 80).toLowerCase();
  const phaseFilter = text(url.searchParams.get("phase")).slice(0, 40).toLowerCase();
  const entry = text(url.searchParams.get("entry")).slice(0, 20).toLowerCase();
  const sort = text(url.searchParams.get("sort")).slice(0, 40).toLowerCase() || "recent";
  const page = Math.max(1, Math.trunc(Number(url.searchParams.get("page") ?? 1) || 1));
  const limit = Math.min(Math.max(Math.trunc(Number(url.searchParams.get("limit") ?? 24) || 24), 1), 48);
  const user = await getOptionalRequestUser(request);
  let sponsor = false;
  if (user) {
    const [accountSnap, profileSnap] = await Promise.all([db.collection("users").doc(user.uid).get(), db.collection("profiles").doc(user.uid).get()]);
    sponsor = isSponsorProfile({ ...(profileSnap.exists ? profileSnap.data() ?? {} : {}), ...(accountSnap.exists ? accountSnap.data() ?? {} : {}) });
  }
  try {
    const snap = await db.collection("challenges").orderBy("createdAt", "desc").limit(160).get();
    const all = snap.docs.flatMap((doc) => {
      const raw = { id: doc.id, ...doc.data() } as Record<string, unknown>;
      if (!isPublicChallenge(doc.id, raw)) return [];
      const phase = getChallengePhaseSummary(raw, new Date(), { eligibleSubmissionCount: Number(raw.approvedSubmissionCount ?? raw.eligibleSubmissionCount ?? 0) });
      if (category && String(raw.category ?? "").toLowerCase() !== category) return [];
      if (phaseFilter && phase.phase !== phaseFilter) return [];
      if (entry === "free" && isPaidEntryChallenge(raw)) return [];
      if (entry === "paid" && !isPaidEntryChallenge(raw)) return [];
      if (!includesText(raw, query)) return [];
      const publicFields = publicChallengeFields(raw);
      const paid = isPaidEntryChallenge(raw);
      const challenge = {
        ...publicFields,
        id: doc.id,
        title: text(raw.title) || "Untitled Challenge",
        description: text(raw.description),
        shortDescription: text(raw.shortDescription ?? raw.description).slice(0, 180),
        coverImageUrl: text(raw.coverImageUrl ?? raw.imageUrl ?? raw.promoImageUrl),
        createdAt: toIso(raw.createdAt),
        updatedAt: toIso(raw.updatedAt),
        publishedAt: toIso(raw.publishedAt ?? raw.createdAt),
        registrationDeadline: toIso(raw.registrationDeadline ?? raw.registrationEndAt ?? raw.registrationClosesAt) ?? raw.registrationDeadline,
        submissionDeadline: toIso(raw.submissionDeadline ?? raw.submissionEndAt ?? raw.submissionClosesAt) ?? raw.submissionDeadline,
        participantCount: Number(raw.participantCount ?? raw.participants ?? 0),
        voteCount: Number(raw.voteCount ?? 0),
        phaseSummary: phase,
        paidEntry: { required: paid, amountCents: paid ? paidEntryAmountCents(raw) : 0, currency: "usd" },
        creator: { displayName: text(raw.creatorName ?? raw.creatorDisplayName) || "Challenge creator", username: text(raw.creatorUsername), avatarUrl: text(raw.creatorAvatarUrl ?? raw.creatorAvatar) },
        cta: ctaFor({ challenge: raw, phase, userId: user?.uid ?? null, sponsor })
      };
      return [challenge];
    });
    const sorted = sortChallenges(all, sort);
    const start = (page - 1) * limit;
    const items = sorted.slice(start, start + limit);
    const featured = sorted.filter((item) => Number(item.participantCount ?? 0) >= 100 || item.sponsorEnabled === true || item.isFeatured === true).slice(0, 8);
    const categories = Array.from(new Set(sorted.map((item) => String(item.category ?? "")).filter(Boolean))).slice(0, 12);
    return ok({ challenges: items, featured, categories, page, limit, total: sorted.length, hasMore: start + limit < sorted.length, filters: { q: query, category, phase: phaseFilter, entry, sort }, privateFieldsExcluded: true, realDataOnly: true }, "Explore challenges loaded.");
  } catch (error) {
    return serverError("Explore challenges could not be loaded.", error instanceof Error ? error.message : error);
  }
}