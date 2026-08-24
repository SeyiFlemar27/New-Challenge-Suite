import { getAdminDb } from "@/lib/firebase/admin";
import { requireRequestUser } from "@/lib/server/auth";
import { forbidden, ok, serverError, serverUnavailable } from "@/lib/server/responses";
import { resolveSponsorOrganizationAccess } from "@/lib/server/sponsor-organizations";

export const dynamic = "force-dynamic";

async function loadSponsor(db: FirebaseFirestore.Firestore, uid: string): Promise<Record<string, unknown> | null> {
  const [userSnap, profileSnap, sponsorAccess] = await Promise.all([
    db.collection("users").doc(uid).get(),
    db.collection("profiles").doc(uid).get(),
    resolveSponsorOrganizationAccess(db, uid)
  ]);
  const sponsorId = sponsorAccess?.organizationId ?? uid;
  const sponsorSnap = await db.collection("sponsorProfiles").doc(sponsorId).get();
  const userData = userSnap.exists ? userSnap.data() ?? {} : {};
  const profileData = profileSnap.exists ? profileSnap.data() ?? {} : {};
  const sponsorData = sponsorSnap.exists ? sponsorSnap.data() ?? {} : {};
  const merged = { ...profileData, ...userData };
  const hasIntent = [merged.roleIntent, merged.role_intent, merged.account_type].some((value) => value === "sponsor") || merged.sponsorOnboardingStatus !== undefined;
  if (!sponsorAccess && !hasIntent) return null;
  return { ...profileData, ...userData, ...sponsorData, userId: uid, sponsorId, sponsorOrganizationId: sponsorId };
}
export async function GET(request: Request) {
  const { user, response } = await requireRequestUser(request);
  if (response) return response;
  const db = getAdminDb();
  if (!db) return serverUnavailable("Sponsor onboarding");
  try {
    const sponsor = await loadSponsor(db, user.uid);
    if (!sponsor) return forbidden("A sponsor account is required.");
    const sponsorId = String(sponsor.sponsorOrganizationId ?? user.uid);
    const onboardingSnap = await db.collection("sponsorOnboarding").doc(sponsorId).get();
    return ok({ onboarding: onboardingSnap.exists ? onboardingSnap.data() : { userId: user.uid, status: sponsor.sponsorOnboardingStatus ?? "not_started", completionPercent: sponsor.onboardingCompletionPercent ?? 0 }, sponsorProfile: sponsor }, "Sponsor onboarding loaded.");
  } catch (error) {
    console.error("[sponsor-onboarding:get]", { userId: user.uid, message: error instanceof Error ? error.message : String(error) });
    return serverError("Sponsor onboarding could not be loaded.");
  }
}

export { POST, PATCH } from "../profile/route";
