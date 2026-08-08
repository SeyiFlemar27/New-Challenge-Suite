import { getAdminDb } from "@/lib/firebase/admin";
import { requireRequestUser } from "@/lib/server/auth";
import { ECONOMY_V1_RULES } from "@/lib/server/economy-rules";
import { ok, readJson, serverUnavailable, validationError } from "@/lib/server/responses";

export async function PATCH(request: Request) {
  const { user, response } = await requireRequestUser(request);
  if (response) return response;
  const parsed = await readJson(request);
  if (parsed.response) return parsed.response;
  const allocationPercent = Number(parsed.body?.allocationPercent);
  const { minimumAllocationPercent, maximumAllocationPercent } = ECONOMY_V1_RULES.growthWallet;
  if (!Number.isFinite(allocationPercent) || allocationPercent < minimumAllocationPercent || allocationPercent > maximumAllocationPercent) return validationError({ allocationPercent: `Allocation must be between ${minimumAllocationPercent}% and ${maximumAllocationPercent}%.` });
  const db = getAdminDb();
  if (!db) return serverUnavailable("Creator Growth Wallet");
  const profile = await db.collection("profiles").doc(user.uid).get();
  const account = await db.collection("users").doc(user.uid).get();
  const role = String(profile.data()?.role ?? account.data()?.role ?? "");
  if (!user.isAdmin && !["creator", "host"].includes(role)) return validationError({ account: "Creator or host access is required." });
  await db.collection("creatorGrowthWallets").doc(user.uid).set({ userId: user.uid, allocationPercent, allocationOptIn: allocationPercent > 0, withdrawable: false, restrictedUseOnly: true, ruleVersion: ECONOMY_V1_RULES.version, updatedAt: new Date().toISOString() }, { merge: true });
  return ok({ allocationPercent, withdrawable: false }, "Creator Growth Wallet allocation preference saved for future creator earnings.");
}
