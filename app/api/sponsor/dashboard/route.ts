import { requireSponsorContext } from "@/lib/server/sponsor";
import { ok, serverError } from "@/lib/server/responses";
import { activeSponsorPreview, buildSponsorAttention, sponsorStudioMetrics } from "@/lib/server/sponsor-studio";

export const dynamic = "force-dynamic";

function text(value: unknown, fallback = "") { return String(value ?? fallback).trim(); }
function safeChallenge(id: string, data: Record<string, unknown>) {
  const sponsorReady = Boolean(data.sponsorEnabled || data.sponsorReady || (data.monetization as Record<string, unknown> | undefined)?.sponsorReady);
  const publicStatus = ["approved", "published", "scheduled", "registration_open", "active", "submission_open", "voting_open"].includes(text(data.status ?? data.lifecycleStatus).toLowerCase());
  if (!sponsorReady || !publicStatus || text(data.visibility, "public").toLowerCase().includes("private")) return null;
  return { id, title: text(data.title, "Untitled challenge"), creatorName: text(data.creatorName, "Creator"), category: text(data.category), imageUrl: data.coverImageUrl ?? data.primaryMediaUrl ?? null, status: text(data.status ?? data.lifecycleStatus), href: "/sponsor/discover/challenges/" + id };
}
function safeCreator(id: string, data: Record<string, unknown>) {
  const accountType = text(data.accountType ?? data.role).toLowerCase();
  const creator = ["creator", "host"].includes(accountType) || data.creatorProfileEnabled === true || data.canCreateChallenges === true;
  const sponsorReady = Boolean(data.sponsorReadyEnabled || data.sponsorReady || data.acceptingSponsors || data.openToSponsors);
  const displayName = text(data.displayName ?? data.fullName ?? data.username);
  if (!creator || !sponsorReady || !displayName || text(data.profileVisibility, "public") === "private") return null;
  return { id, displayName, category: text(data.primaryCategory ?? data.category ?? data.creatorNiche), avatarUrl: data.avatarUrl ?? data.photoURL ?? null, href: "/sponsor/discover/creators/" + id };
}

export async function GET(request: Request) {
  const { context, response } = await requireSponsorContext(request, { allowHistorical: true });
  if (response) return response;
  if (!context) return serverError("Sponsor access could not be verified.");
  const { db, user, sponsorId } = context;
  const names = ["sponsorships", "proposals", "deliverables", "wallet", "analytics", "challenges", "creators"] as const;
  try {
    const results = await Promise.allSettled([
      db.collection("sponsorships").where("sponsorId", "==", sponsorId).limit(100).get(),
      db.collection("sponsorProposals").where("sponsorId", "==", sponsorId).limit(100).get(),
      db.collection("sponsorDeliverables").where("sponsorId", "==", sponsorId).limit(100).get(),
      db.collection("sponsorWallets").doc(sponsorId).get(),
      db.collection("sponsorAnalyticsSnapshots").where("sponsorId", "==", sponsorId).limit(50).get(),
      db.collection("challenges").limit(150).get(),
      db.collection("profiles").limit(150).get()
    ]);
    const widgetErrors: Record<string, string> = {};
    const docs = (index: number) => {
      const result = results[index];
      if (result.status === "fulfilled" && "docs" in result.value) return result.value.docs;
      widgetErrors[names[index]] = "This section could not be loaded.";
      if (result.status === "rejected") console.error("[sponsor-studio:widget]", { userId: user.uid, widget: names[index], message: result.reason instanceof Error ? result.reason.message : String(result.reason) });
      return [];
    };
    const sponsorships = docs(0).map((doc) => ({ id: doc.id, ...doc.data() }));
    const proposals = docs(1).map((doc) => ({ id: doc.id, ...doc.data() }));
    const deliverables = docs(2).map((doc) => ({ id: doc.id, ...doc.data() }));
    const walletResult = results[3];
    const wallet = walletResult.status === "fulfilled" && "data" in walletResult.value ? walletResult.value.data() ?? {} : {};
    if (walletResult.status === "rejected") widgetErrors.wallet = "Wallet balance could not be loaded.";
    const analytics = docs(4).map((doc) => ({ id: doc.id, ...doc.data() } as Record<string, unknown> & { id: string })).sort((left, right) => text(right.reconciledAt ?? right.updatedAt).localeCompare(text(left.reconciledAt ?? left.updatedAt)));
    const attention = buildSponsorAttention({ profile: context.sponsorProfile, proposals, sponsorships, deliverables, wallet });
    const metrics = sponsorStudioMetrics({ sponsorships, proposals, attention, wallet });
    const challenges = docs(5).flatMap((doc) => { const item = safeChallenge(doc.id, doc.data()); return item ? [item] : []; }).slice(0, 4);
    const creators = docs(6).flatMap((doc) => { const item = safeCreator(doc.id, doc.data()); return item ? [item] : []; }).slice(0, 4);
    return ok({
      sponsorProfile: { ...context.sponsorProfile, organizationStatus: context.sponsorAccess.status },
      metrics,
      attention,
      sponsorships: activeSponsorPreview(sponsorships, attention),
      recommendations: { challenges, creators, source: "canonical_discovery_relevance" },
      performance: analytics[0] ?? null,
      performanceState: analytics[0]?.finalized === true ? "finalized" : analytics.length ? "live" : "not_recorded",
      widgetErrors
    }, "Sponsor Studio loaded.");
  } catch (error) {
    console.error("[sponsor-studio:get]", { userId: user.uid, message: error instanceof Error ? error.message : String(error) });
    return serverError("Sponsor Studio could not be loaded.");
  }
}