import { getAdminDb } from "@/lib/firebase/admin";
import { ok, serverError, serverUnavailable } from "@/lib/server/responses";
import { getActiveEconomyRules } from "@/lib/server/economy-rules";

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
    const [snap, rules] = await Promise.all([
      runPackageQuery(db.collection("doroCoinPackages").where("status", "==", "active").limit(50).get()),
      getActiveEconomyRules(db)
    ]);
    const packages = snap.docs.map((doc) => {
      const data = doc.data();
      const price = Number(data.price ?? 0);
      const coins = Number(data.coins ?? 0);
      const baseCoins = Number(data.baseCoins ?? data.coins ?? 0);
      const minimumBaseCoins = Math.round(price * rules.doroCoin.coinsPerUsd);
      return {
        id: doc.id,
        name: data.name,
        coins,
        baseCoins,
        bonusCoins: Number(data.bonusCoins ?? Math.max(0, coins - baseCoins)),
        price,
        bestFor: data.bestFor ?? data.description ?? "",
        mostPopular: Boolean(data.mostPopular),
        status: data.status,
        sortOrder: Number(data.sortOrder ?? 0),
        pricingConsistent: price > 0 && baseCoins >= minimumBaseCoins
      };
    }).filter((item) => item.pricingConsistent).sort((a, b) => a.sortOrder - b.sortOrder).slice(0, 20);

    return ok({ packages, coinsPerUsd: rules.doroCoin.coinsPerUsd }, packages.length ? "DoroCoin packages loaded." : "No consistently priced DoroCoin packages are currently available.");
  } catch (error) {
    const details = packageErrorDetails(error);
    console.error("[dorocoin-packages] load failed", details);
    return serverError("DoroCoin packages could not be loaded.", details);
  }
}
