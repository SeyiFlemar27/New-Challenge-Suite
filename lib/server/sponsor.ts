import { getAdminDb } from "@/lib/firebase/admin";
import { normalizeAccountType } from "@/lib/plan-access";
import { requireRequestUser, type RequestUser } from "@/lib/server/auth";
import { fail, forbidden, serverError, serverUnavailable } from "@/lib/server/responses";

export type SponsorServerContext = {
  user: RequestUser;
  db: FirebaseFirestore.Firestore;
  sponsorProfile: Record<string, unknown>;
};

export async function requireSponsorContext(request: Request): Promise<{ context: SponsorServerContext | null; response: Response | null }> {
  const { user, response } = await requireRequestUser(request);
  if (response) return { context: null, response };
  const db = getAdminDb();
  if (!db) return { context: null, response: serverUnavailable("Sponsor workspace") };
  try {
    const [userSnap, profileSnap, sponsorSnap] = await Promise.all([
      db.collection("users").doc(user.uid).get(),
      db.collection("profiles").doc(user.uid).get(),
      db.collection("sponsorProfiles").doc(user.uid).get()
    ]);
    const userData = userSnap.exists ? userSnap.data() ?? {} : {};
    const profileData = profileSnap.exists ? profileSnap.data() ?? {} : {};
    const sponsorData = sponsorSnap.exists ? sponsorSnap.data() ?? {} : {};
    if (normalizeAccountType({ ...profileData, ...userData }) !== "sponsor") {
      return { context: null, response: forbidden("A sponsor account is required.") };
    }
    return { context: { user, db, sponsorProfile: { ...profileData, ...userData, ...sponsorData, userId: user.uid } }, response: null };
  } catch (error) {
    console.error("[sponsor-context]", { userId: user.uid, message: error instanceof Error ? error.message : String(error) });
    return { context: null, response: serverError("Sponsor access could not be verified.") };
  }
}

export async function assertSponsorOwnedDoc(db: FirebaseFirestore.Firestore, collection: string, id: string, sponsorId: string) {
  const snap = await db.collection(collection).doc(id).get();
  if (!snap.exists) return { snap, response: fail("Record not found.", 404, undefined, "NOT_FOUND") };
  const data = snap.data() ?? {};
  if (data.sponsorId !== sponsorId && data.ownerUid !== sponsorId && data.createdBy !== sponsorId) {
    return { snap, response: forbidden("You can only access your own sponsor records.") };
  }
  return { snap, response: null };
}
