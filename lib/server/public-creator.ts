import { getAdminDb } from "@/lib/firebase/admin";

/** Public identity only; never return account IDs, roles, email, KYC or billing fields. */
export async function loadPublicCreator(userId: unknown) {
  if (typeof userId !== "string" || !userId || userId.includes("/")) return null;
  const db = getAdminDb();
  if (!db) return null;
  const [profile, account] = await db.getAll(db.collection("profiles").doc(userId), db.collection("users").doc(userId));
  const p = profile.data() ?? {}, a = account.data() ?? {};
  if (p.publicProfile === false || a.publicProfile === false || p.profileVisibility === "private" || a.profileVisibility === "private" || ["suspended", "disabled", "deleted", "deactivated"].includes(String(a.accountStatus))) return null;
  const displayName = String(p.displayName ?? a.displayName ?? p.username ?? a.username ?? "").trim();
  return displayName ? { displayName: displayName.slice(0, 120) } : null;
}
