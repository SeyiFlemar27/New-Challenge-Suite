import { getAdminDb } from "@/lib/firebase/admin";
import { requireAdminUser } from "@/lib/server/auth";
import { ok, serverError, serverUnavailable } from "@/lib/server/responses";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const { user, response } = await requireAdminUser(request);
  if (response) return response;
  const db = getAdminDb();
  if (!db) return serverUnavailable("Sponsor admin");
  try {
    const snap = await db.collection("sponsorProfiles").orderBy("updatedAt", "desc").limit(100).get();
    return ok({ sponsors: snap.docs.map((doc) => ({ id: doc.id, ...doc.data(), adminCanVerify: true, rawDocumentsExposed: false })) }, "Sponsors loaded.");
  } catch (error) {
    console.error("[admin-sponsors:get]", { adminId: user.uid, message: error instanceof Error ? error.message : String(error) });
    return serverError("Sponsors could not be loaded.");
  }
}