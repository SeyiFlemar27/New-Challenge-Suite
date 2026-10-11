import type { Firestore } from "firebase-admin/firestore";
import { getAdminDb } from "@/lib/firebase/admin";
import { enterpriseChallengeInScope, hasEnterprisePermission, normalizeEnterpriseAccess, type EnterprisePermission } from "@/lib/enterprise-access";
import { requireRequestUser } from "@/lib/server/auth";
import { forbidden, serverUnavailable } from "@/lib/server/responses";

export async function requireEnterprisePermission(request: Request, permission: EnterprisePermission) {
  const auth = await requireRequestUser(request);
  if (auth.response) return { ...auth, db: null, access: null };
  const db = getAdminDb();
  if (!db) return { user: null, db: null, access: null, response: serverUnavailable("Enterprise workspace") };
  const [userSnap, profileSnap] = await Promise.all([db.collection("users").doc(auth.user!.uid).get(), db.collection("profiles").doc(auth.user!.uid).get()]);
  const access = normalizeEnterpriseAccess({ ...(profileSnap.data() ?? {}), ...(userSnap.data() ?? {}) });
  if (!hasEnterprisePermission(access, permission) || !access?.organizationId) return { user: null, db: null, access: null, response: forbidden("Your Enterprise role does not include this action.") };
  const organizationSnap = await db.collection("enterpriseOrganizations").doc(access.organizationId).get();
  if (!organizationSnap.exists || String(organizationSnap.data()?.status ?? "").toLowerCase() !== "active") {
    return { user: null, db: null, access: null, response: forbidden("This Enterprise organization is not active.") };
  }
  return { user: auth.user!, db, access: { ...access, organizationStatus: "active" }, response: null };
}

export async function requireEnterpriseChallengeAccess(request: Request, challengeId: string, permission: EnterprisePermission, write = false) {
  const result = await requireEnterprisePermission(request, permission);
  if (result.response) return { ...result, challenge: null };
  const snap = await result.db!.collection("challenges").doc(challengeId).get();
  const challenge = snap.exists ? { id: snap.id, ...snap.data() } : null;
  if (!challenge || !enterpriseChallengeInScope(result.access!, challenge, result.user!.uid, write)) return { ...result, challenge: null, response: forbidden("This official challenge is outside your Enterprise access scope.") };
  return { ...result, challenge, response: null };
}

export async function enterpriseProfile(db: Firestore, userId: string) {
  const [userSnap, profileSnap] = await Promise.all([db.collection("users").doc(userId).get(), db.collection("profiles").doc(userId).get()]);
  return { profile: { ...(profileSnap.data() ?? {}), ...(userSnap.data() ?? {}) }, access: normalizeEnterpriseAccess({ ...(profileSnap.data() ?? {}), ...(userSnap.data() ?? {}) }) };
}
