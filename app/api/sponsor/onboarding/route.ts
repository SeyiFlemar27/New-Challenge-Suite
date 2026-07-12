import { getAdminDb } from "@/lib/firebase/admin";
import { normalizeAccountType } from "@/lib/plan-access";
import { requireRequestUser } from "@/lib/server/auth";
import { forbidden, ok, serverError, serverUnavailable } from "@/lib/server/responses";

export const dynamic = "force-dynamic";

async function loadSponsor(db: FirebaseFirestore.Firestore, uid: string): Promise<Record<string, unknown> | null> {
  const [userSnap, profileSnap, sponsorSnap] = await Promise.all([
    db.collection("users").doc(uid).get(),
    db.collection("profiles").doc(uid).get(),
    db.collection("sponsorProfiles").doc(uid).get()
  ]);
  const userData = userSnap.exists ? userSnap.data() ?? {} : {};
  const profileData = profileSnap.exists ? profileSnap.data() ?? {} : {};
  const sponsorData = sponsorSnap.exists ? sponsorSnap.data() ?? {} : {};
  if (normalizeAccountType({ ...profileData, ...userData }) !== "sponsor") return null;
  return { ...profileData, ...userData, ...sponsorData, userId: uid };
}
export async function GET(request: Request) {
  const { user, response } = await requireRequestUser(request);
  if (response) return response;
  const db = getAdminDb();
  if (!db) return serverUnavailable("Sponsor onboarding");
  try {
    const sponsor = await loadSponsor(db, user.uid);
    if (!sponsor) return forbidden("A sponsor account is required.");
    const onboardingSnap = await db.collection("sponsorOnboarding").doc(user.uid).get();
    return ok({ onboarding: onboardingSnap.exists ? onboardingSnap.data() : { userId: user.uid, status: sponsor.sponsorOnboardingStatus ?? "not_started", completionPercent: sponsor.onboardingCompletionPercent ?? 0 }, sponsorProfile: sponsor }, "Sponsor onboarding loaded.");
  } catch (error) {
    console.error("[sponsor-onboarding:get]", { userId: user.uid, message: error instanceof Error ? error.message : String(error) });
    return serverError("Sponsor onboarding could not be loaded.");
  }
}

export { POST, PATCH } from "../profile/route";