import { getAdminDb } from "@/lib/firebase/admin";
import { requireRequestUser } from "@/lib/server/auth";
import { ensureWallet } from "@/lib/server/dorocoin";
import { ok, serverError, serverUnavailable } from "@/lib/server/responses";

export const dynamic = "force-dynamic";

function toIso(value: unknown): string | null {
  if (!value) return null;
  if (typeof value === "string") return value;
  if (value instanceof Date) return value.toISOString();
  if (typeof value === "object" && "toDate" in value && typeof value.toDate === "function") {
    return value.toDate().toISOString();
  }
  return null;
}

export async function GET(request: Request) {
  const { user, response } = await requireRequestUser(request);
  if (response) return response;

  const db = getAdminDb();
  if (!db) return serverUnavailable("Wallet");

  try {
    const walletRef = await ensureWallet(db, user.uid);
    const [walletSnap, profileSnap, userSnap, transactionSnap] = await Promise.all([
      walletRef.get(),
      db.collection("profiles").doc(user.uid).get(),
      db.collection("users").doc(user.uid).get(),
      db.collection("doroCoinTransactions").where("userId", "==", user.uid).orderBy("createdAt", "desc").limit(50).get()
    ]);

    const wallet = walletSnap.data() ?? {};
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
      })
    }, "Wallet loaded.");
  } catch (error) {
    return serverError("Wallet could not be loaded.", error instanceof Error ? error.message : error);
  }
}
