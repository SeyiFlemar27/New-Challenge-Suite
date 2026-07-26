import { getAdminDb } from "@/lib/firebase/admin";
import { requireAdminUser } from "@/lib/server/auth";
import { ok, serverUnavailable } from "@/lib/server/responses";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const { response } = await requireAdminUser(request);
  if (response) return response;
  const db = getAdminDb();
  if (!db) return serverUnavailable("Admin tournament center");
  const url = new URL(request.url);
  const status = url.searchParams.get("status");
  let query: FirebaseFirestore.Query = db.collection("tournaments");
  if (status) query = query.where("status", "==", status);
  const snap = await query.orderBy("updatedAt", "desc").limit(100).get();
  return ok({ tournaments: snap.docs.map((doc) => ({ id: doc.id, ...doc.data() })), emptyState: snap.empty ? "No tournament records match this admin view." : null }, "Admin tournament queue loaded.");
}
