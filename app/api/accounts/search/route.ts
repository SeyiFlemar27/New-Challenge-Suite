import { getAdminDb } from "@/lib/firebase/admin";
import { requireAuthenticatedUser } from "@/lib/server/auth";
import { ok, serverUnavailable } from "@/lib/server/responses";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const auth = await requireAuthenticatedUser(request);
  if (auth.response) return auth.response;
  const db = getAdminDb();
  if (!db) return serverUnavailable("Registered account search");
  const url = new URL(request.url);
  const query = (url.searchParams.get("q") ?? "").trim().toLowerCase().slice(0, 80);
  if (query.length < 2) return ok({ accounts: [] }, "Enter at least two characters.");
  const snap = await db.collection("profiles").limit(100).get();
  const matches = snap.docs.map((doc) => {
    const data = doc.data() ?? {};
    return { id: doc.id, displayName: String(data.displayName ?? data.name ?? data.username ?? "Account"), username: typeof data.username === "string" ? data.username : null, profileStatus: String(data.accountStatus ?? "active") };
  }).filter((account) => account.profileStatus === "active" && `${account.displayName} ${account.username ?? ""}`.toLowerCase().includes(query)).slice(0, 24);
  const userSnaps = matches.length ? await db.getAll(...matches.map((account) => db.collection("users").doc(account.id))) : [];
  const accounts = matches.filter((_account, index) => userSnaps[index]?.exists && String(userSnaps[index]?.data()?.accountStatus ?? "active") === "active").slice(0, 12).map(({ profileStatus: _status, ...account }) => account);
  return ok({ accounts }, "Registered accounts loaded.");
}
