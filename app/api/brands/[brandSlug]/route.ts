import { getAdminDb } from "@/lib/firebase/admin";
import { fail, ok, serverUnavailable } from "@/lib/server/responses";
import { publicChallengeFields } from "@/lib/server/public-challenge";
import { publicPrizePoolFields } from "@/lib/server/prize-pools";

export async function GET(_request: Request, { params }: { params: Promise<{ brandSlug: string }> }) {
  const { brandSlug } = await params;
  const db = getAdminDb();
  if (!db) return serverUnavailable("Brand profile");
  const sponsorQuery = await db.collection("sponsorProfiles").where("brandSlug", "==", brandSlug).limit(1).get();
  const sponsorDoc = sponsorQuery.docs[0];
  if (!sponsorDoc || sponsorDoc.data().sponsorVerificationStatus !== "approved") return fail("Verified brand profile not found.", 404, undefined, "NOT_FOUND");
  const brand = sponsorDoc.data();
  const [sponsorshipsSnap, campaignsSnap] = await Promise.all([
    db.collection("sponsorships").where("sponsorId", "==", sponsorDoc.id).limit(100).get(),
    db.collection("sponsorCampaigns").where("sponsorId", "==", sponsorDoc.id).limit(100).get()
  ]);
  const approvedSponsorships = sponsorshipsSnap.docs.filter((doc) => doc.data().status === "approved");
  const challenges = await Promise.all(approvedSponsorships.map(async (doc) => {
    const challengeId = String(doc.data().challengeId ?? "");
    const challenge = await db.collection("challenges").doc(challengeId).get();
    return challenge.exists ? { id: challenge.id, ...publicChallengeFields(challenge.data() ?? {}) } : null;
  }));
  const prizePools = await Promise.all(approvedSponsorships.map(async (doc) => {
    const challengeId = String(doc.data().challengeId ?? "");
    const pool = await db.collection("prizePools").doc(challengeId).get();
    return { challengeId, ...publicPrizePoolFields(pool.exists ? pool.data() : null) };
  }));
  return ok({
    brand: {
      userId: sponsorDoc.id,
      brandName: brand.brandName ?? "",
      brandSlug,
      logoUrl: brand.logoUrl ?? null,
      bannerUrl: brand.bannerUrl ?? null,
      industry: brand.industry ?? "",
      website: brand.website ?? null,
      brandDescription: brand.brandDescription ?? "",
      ctaButtonText: brand.ctaButtonText ?? "Visit Website",
      ctaDestinationLink: brand.ctaDestinationLink ?? brand.website ?? null,
      verified: true
    },
    sponsored: challenges.filter(Boolean),
    campaigns: campaignsSnap.docs.filter((doc) => !["draft", "cancelled"].includes(String(doc.data().status))).map((doc) => ({
      id: doc.id,
      title: doc.data().title ?? doc.data().name ?? "Brand campaign",
      description: doc.data().description ?? "",
      status: doc.data().status ?? "active",
      startsAt: doc.data().startsAt ?? null,
      endsAt: doc.data().endsAt ?? null
    })),
    prizePools
  }, "Brand profile loaded.");
}
