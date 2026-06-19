import { getAdminDb } from "@/lib/firebase/admin";
import { ok, serverUnavailable } from "@/lib/server/responses";

export async function GET() {
  const db = getAdminDb();
  if (!db) return serverUnavailable("Boost packages");
  const snap = await db.collection("boostPackages").where("active", "==", true).orderBy("sortOrder", "asc").get();
  const packages = snap.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
  return ok({ packages }, "Boost packages loaded.");
}
