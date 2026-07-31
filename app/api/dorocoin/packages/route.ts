import { getAdminDb } from "@/lib/firebase/admin";
import { ok, serverError, serverUnavailable } from "@/lib/server/responses";

export const dynamic = "force-dynamic";

type PackageQueryError = Error & {
  queryName?: "packages";
  code?: unknown;
  details?: unknown;
};

async function runPackageQuery<T>(query: Promise<T>) {
  try {
    return await query;
  } catch (error) {
    const wrapped = error instanceof Error ? error as PackageQueryError : new Error("DoroCoin package query failed.") as PackageQueryError;
    wrapped.queryName = "packages";
    throw wrapped;
  }
}

function isFirestoreIndexError(error: unknown) {
  const candidate = error as { code?: unknown; message?: unknown; details?: unknown };
  const text = `${String(candidate?.code ?? "")} ${String(candidate?.message ?? "")} ${String(candidate?.details ?? "")}`.toLowerCase();
  return text.includes("failed_precondition") || text.includes("requires an index") || text.includes("index");
}

function packageErrorDetails(error: unknown) {
  const candidate = error as PackageQueryError;
  const firestoreMessage = typeof candidate?.message === "string" ? candidate.message : "DoroCoin package query failed.";

  if (isFirestoreIndexError(error)) {
    return {
      reason: "firestore_index_required",
      queryName: candidate.queryName ?? "packages",
      query: "doroCoinPackages where status == active, sorted by sortOrder asc in API",
      firestoreCode: candidate?.code ?? null,
      firestoreMessage,
      requiredIndex: null
    };
  }

  return {
    reason: "dorocoin_packages_query_failed",
    queryName: candidate.queryName ?? "packages",
    query: "doroCoinPackages where status == active, sorted by sortOrder asc in API",
    firestoreCode: candidate?.code ?? null,
    firestoreMessage
  };
}

export async function GET() {
  const db = getAdminDb();
  if (!db) return serverUnavailable("DoroCoin packages");

  try {
    const snap = await runPackageQuery(db.collection("doroCoinPackages").where("status", "==", "active").limit(50).get());
    const packages = snap.docs.map((doc) => {
      const data = doc.data();
      return {
        id: doc.id,
        name: data.name,
        coins: Number(data.coins ?? 0),
        baseCoins: Number(data.baseCoins ?? data.coins ?? 0),
        bonusCoins: Number(data.bonusCoins ?? Math.max(0, Number(data.coins ?? 0) - Number(data.baseCoins ?? data.coins ?? 0))),
        price: Number(data.price ?? 0),
        bestFor: data.bestFor ?? data.description ?? "",
        mostPopular: Boolean(data.mostPopular),
        status: data.status,
        sortOrder: Number(data.sortOrder ?? 0)
      };
    }).sort((a, b) => a.sortOrder - b.sortOrder).slice(0, 20);

    return ok({ packages }, packages.length ? "DoroCoin packages loaded." : "No active DoroCoin packages are configured.");
  } catch (error) {
    const details = packageErrorDetails(error);
    console.error("[dorocoin-packages] load failed", details);
    return serverError("DoroCoin packages could not be loaded.", details);
  }
}
