import { getAdminDb } from "@/lib/firebase/admin";
import { requireAdminUser } from "@/lib/server/auth";
import { ok, serverError, serverUnavailable } from "@/lib/server/responses";

export const dynamic = "force-dynamic";

export async function GET(request: Request, { params }: { params: Promise<{ sponsorId: string }> }) {
  const { user, response } = await requireAdminUser(request);
  if (response) return response;
  const db = getAdminDb();
  if (!db) return serverUnavailable("Sponsor admin");
  try {
    const { sponsorId } = await params;
    const [profileSnap, activitySnap, settingsSnap] = await Promise.all([
      db.collection("sponsorProfiles").doc(sponsorId).get(),
      db.collection("sponsorActivity").where("userId", "==", sponsorId).orderBy("createdAt", "desc").limit(25).get(),
      db.collection("sponsorSettings").doc(sponsorId).get()
    ]);
    return ok({
      sponsor: profileSnap.exists ? { id: profileSnap.id, ...profileSnap.data(), rawDocumentsExposed: false } : null,
      settings: settingsSnap.exists ? settingsSnap.data() : null,
      activity: activitySnap.docs.map((doc) => ({ id: doc.id, ...doc.data() }))
    }, "Sponsor detail loaded.");
  } catch (error) {
    console.error("[admin-sponsor-detail:get]", { adminId: user.uid, message: error instanceof Error ? error.message : String(error) });
    return serverError("Sponsor detail could not be loaded.");
  }
}