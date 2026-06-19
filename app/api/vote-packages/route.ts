import { getAdminDb } from "@/lib/firebase/admin";
import { ok, serverUnavailable } from "@/lib/server/responses";

export async function GET() {
  const db = getAdminDb();
  if (!db) return serverUnavailable("Vote packages");
  const snap = await db.collection("votePackages").where("active", "==", true).orderBy("sortOrder", "asc").get();
  const packages = snap.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
  return ok({ packages }, "Vote packages loaded.");
}
