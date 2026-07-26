import { getAdminDb } from "@/lib/firebase/admin";
import { requireAdminUser } from "@/lib/server/auth";
import { ok, serverUnavailable } from "@/lib/server/responses";
import { isFirestoreMissingIndexError } from "@/lib/server/tournament-public";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const { response } = await requireAdminUser(request);
  if (response) return response;
  const db = getAdminDb();
  if (!db) return serverUnavailable("Admin tournament center");
  const url = new URL(request.url);
  const status = url.searchParams.get("status");
  try {
    const snap = await db.collection("tournaments").orderBy("updatedAt", "desc").limit(100).get();
    const tournaments = snap.docs
      .map((doc) => ({ id: doc.id, ...doc.data() }) as Record<string, unknown> & { id: string })
      .filter((item) => !status || item.status === status);
    return ok({ tournaments, emptyState: tournaments.length ? null : "No tournament records match this admin view." }, "Admin tournament queue loaded.");
  } catch (error) {
    if (isFirestoreMissingIndexError(error)) {
      console.warn("[tournament-firestore-index]", { scope: "api:admin:tournaments:list", message: "Firestore index required for this query." });
      return ok({ tournaments: [], emptyState: "Firestore index required for this query." }, "Admin tournament queue requires setup.");
    }
    throw error;
  }
}
