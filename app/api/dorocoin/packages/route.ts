import { getAdminDb } from "@/lib/firebase/admin";
import { ok, serverError, serverUnavailable } from "@/lib/server/responses";

export const dynamic = "force-dynamic";

export async function GET() {
  const db = getAdminDb();
  if (!db) return serverUnavailable("DoroCoin packages");

  try {
    const snap = await db.collection("doroCoinPackages").where("status", "==", "active").orderBy("sortOrder", "asc").limit(20).get();
    const packages = snap.docs.map((doc) => {
      const data = doc.data();
      return {
        id: doc.id,
        name: data.name,
        coins: Number(data.coins ?? 0),
        price: Number(data.price ?? 0),
        bestFor: data.bestFor ?? data.description ?? "",
        status: data.status,
        sortOrder: Number(data.sortOrder ?? 0)
      };
    });

    return ok({ packages }, "DoroCoin packages loaded.");
  } catch (error) {
    return serverError("DoroCoin packages could not be loaded.", error instanceof Error ? error.message : error);
  }
}
