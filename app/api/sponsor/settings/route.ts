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
  if (!db) return serverUnavailable("Sponsor settings");
  try {
    const sponsor = await loadSponsor(db, user.uid);
    if (!sponsor) return forbidden("A sponsor account is required.");
    const settingsSnap = await db.collection("sponsorSettings").doc(user.uid).get();
    return ok({ sponsorProfile: sponsor, settings: settingsSnap.exists ? settingsSnap.data() : { userId: user.uid, publicProfile: sponsor.publicProfile ?? false, notificationPreferences: sponsor.notificationPreferences ?? {} } }, "Sponsor settings loaded.");
  } catch (error) {
    console.error("[sponsor-settings:get]", { userId: user.uid, message: error instanceof Error ? error.message : String(error) });
    return serverError("Sponsor settings could not be loaded.");
  }
}

export { PATCH } from "../profile/route";