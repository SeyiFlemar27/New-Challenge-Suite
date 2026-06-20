import { getAdminDb } from "@/lib/firebase/admin";
import { requireRequestUser } from "@/lib/server/auth";
import { ensureWallet } from "@/lib/server/dorocoin";
import { ok, serverError, serverUnavailable } from "@/lib/server/responses";

export const dynamic = "force-dynamic";

type WalletQueryName = "ensureWallet" | "wallet" | "profile" | "user" | "transactions";

type WalletQueryError = Error & {
  queryName?: WalletQueryName;
  code?: unknown;
  details?: unknown;
};

const WALLET_QUERY_DESCRIPTIONS: Record<WalletQueryName, string> = {
  ensureWallet: "doroCoinWallets/{uid} create if missing",
  wallet: "doroCoinWallets/{uid}",
  profile: "profiles/{uid}",
  user: "users/{uid}",
  transactions: "doroCoinTransactions where userId == uid, sorted by createdAt desc in API"
};

function toIso(value: unknown): string | null {
  if (!value) return null;
  if (typeof value === "string") return value;
  if (value instanceof Date) return value.toISOString();
  if (typeof value === "object" && "toDate" in value && typeof value.toDate === "function") {
    return value.toDate().toISOString();
  }
  return null;
}

function createdAtMs(value: unknown) {
  const iso = toIso(value);
  if (!iso) return 0;
  const ms = Date.parse(iso);
  return Number.isFinite(ms) ? ms : 0;
}

async function runWalletQuery<T>(queryName: WalletQueryName, query: Promise<T>) {
  try {
    return await query;
  } catch (error) {
    const wrapped = error instanceof Error ? error as WalletQueryError : new Error("Wallet query failed.") as WalletQueryError;
    wrapped.queryName = queryName;
    throw wrapped;
  }
}

function isFirestoreIndexError(error: unknown) {
  const candidate = error as { code?: unknown; message?: unknown; details?: unknown };
  const text = `${String(candidate?.code ?? "")} ${String(candidate?.message ?? "")} ${String(candidate?.details ?? "")}`.toLowerCase();
  return text.includes("failed_precondition") || text.includes("requires an index") || text.includes("index");
}

function walletErrorDetails(error: unknown) {
  const candidate = error as WalletQueryError;
  const queryName = candidate?.queryName ?? null;
  const firestoreMessage = typeof candidate?.message === "string" ? candidate.message : "Wallet query failed.";

  if (isFirestoreIndexError(error)) {
    return {
      reason: "firestore_index_required",
      queryName,
      query: queryName ? WALLET_QUERY_DESCRIPTIONS[queryName] : null,
      firestoreCode: candidate?.code ?? null,
      firestoreMessage,
      requiredIndex: null
    };
  }

  return {
    reason: "wallet_query_failed",
    queryName,
    query: queryName ? WALLET_QUERY_DESCRIPTIONS[queryName] : null,
    firestoreCode: candidate?.code ?? null,
    firestoreMessage
  };
}

export async function GET(request: Request) {
  const { user, response } = await requireRequestUser(request);
  if (response) return response;

  const db = getAdminDb();
  if (!db) return serverUnavailable("Wallet");

  try {
    const walletRef = await runWalletQuery("ensureWallet", ensureWallet(db, user.uid));
    const [walletSnap, profileSnap, userSnap, transactionSnap] = await Promise.all([
      runWalletQuery("wallet", walletRef.get()),
      runWalletQuery("profile", db.collection("profiles").doc(user.uid).get()),
      runWalletQuery("user", db.collection("users").doc(user.uid).get()),
      runWalletQuery("transactions", db.collection("doroCoinTransactions").where("userId", "==", user.uid).limit(100).get())
    ]);

    const wallet = walletSnap.exists ? walletSnap.data() ?? {} : { userId: user.uid, balance: 0, lockedBalance: 0, updatedAt: null };
    const profile = profileSnap.exists ? profileSnap.data() ?? {} : {};
    const account = userSnap.exists ? userSnap.data() ?? {} : {};

    return ok({
      user: {
        uid: user.uid,
        email: user.email ?? profile.email ?? account.email ?? "",
        displayName: profile.displayName ?? account.displayName ?? "",
        role: account.role ?? profile.role ?? null,
        planId: account.planId ?? profile.planId ?? null
      },
      wallet: {
        userId: user.uid,
        balance: Number(wallet.balance ?? 0),
        lockedBalance: Number(wallet.lockedBalance ?? 0),
        updatedAt: toIso(wallet.updatedAt)
      },
      transactions: transactionSnap.docs.map((doc) => {
        const data = doc.data();
        return {
          ...data,
          id: doc.id,
          createdAt: toIso(data.createdAt)
        };
      }).sort((a, b) => createdAtMs(b.createdAt) - createdAtMs(a.createdAt)).slice(0, 50)
    }, "Wallet loaded.");
  } catch (error) {
    const details = walletErrorDetails(error);
    console.error("[wallet] load failed", details);
    return serverError("Wallet could not be loaded.", details);
  }
}
