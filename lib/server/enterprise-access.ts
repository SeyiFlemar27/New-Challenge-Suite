import type { Firestore } from "firebase-admin/firestore";
import { getAdminDb } from "@/lib/firebase/admin";
import { enterpriseAccessState, enterpriseChallengeInScope, hasEnterprisePermission, normalizeEnterpriseAccess, type EnterpriseAccessRecord, type EnterprisePermission } from "@/lib/enterprise-access";
import { requireRequestUser } from "@/lib/server/auth";
import { fail, serverUnavailable } from "@/lib/server/responses";

const obligationStatuses = new Set(["approved", "scheduled", "active", "submission_open", "voting_open", "voting_closed", "under_review", "results_review", "pending_settlement"]);
const obligationPermissions = new Set<EnterprisePermission>(["challenge.view", "challenge.edit", "participants.view", "participants.manage", "submissions.view", "submissions.review", "reviews.view", "results.view", "results.propose", "finance.view", "finance.prepare", "notes.view", "notes.write", "activity.view"]);

async function obligationChallengeIds(db: Firestore, access: EnterpriseAccessRecord, userId: string) {
  const snapshot = await db.collection("challenges").where("organizationOwnerId", "==", access.enterpriseId).limit(200).get();
  return snapshot.docs
    .filter((doc) => obligationStatuses.has(String(doc.data().status ?? doc.data().lifecycleStatus ?? "")))
    .filter((doc) => enterpriseChallengeInScope(access, { id: doc.id, ...doc.data() }, userId))
    .map((doc) => doc.id);
}

export async function resolveEnterpriseAccessForUser(db: Firestore, userId: string) {
  const [userSnap, profileSnap] = await Promise.all([db.collection("users").doc(userId).get(), db.collection("profiles").doc(userId).get()]);
  const access = normalizeEnterpriseAccess({ ...(profileSnap.data() ?? {}), ...(userSnap.data() ?? {}) });
  const state = enterpriseAccessState(access);
  return { access, state };
}

export async function requireEnterprisePermission(request: Request, permission: EnterprisePermission, options: { allowObligationAccess?: boolean } = {}) {
  const auth = await requireRequestUser(request);
  if (auth.response) return { ...auth, db: null, access: null };
  const db = getAdminDb();
  if (!db) return { user: null, db: null, access: null, response: serverUnavailable("Enterprise workspace") };
  const { access, state } = await resolveEnterpriseAccessForUser(db, auth.user!.uid);
  if (!access) return { user: null, db: null, access: null, response: fail("Enterprise access is required for this workspace.", 403, undefined, "ENTERPRISE_ACCESS_REQUIRED") };
  if (state === "revoked") return { user: null, db: null, access: null, response: fail("Enterprise access has been revoked. Your Personal Workspace is still available.", 403, undefined, "ENTERPRISE_ACCESS_REVOKED") };
  if (state === "suspended") return { user: null, db: null, access: null, response: fail("Enterprise access is suspended. Contact Support for assistance.", 403, undefined, "ENTERPRISE_ACCESS_SUSPENDED") };
  if (state === "pending_onboarding" && permission !== "challenge.view") return { user: null, db: null, access: null, response: fail("Complete Enterprise onboarding before starting operational work.", 403, undefined, "ENTERPRISE_ONBOARDING_REQUIRED") };
  if (state === "expired") {
    const ids = options.allowObligationAccess && obligationPermissions.has(permission) ? await obligationChallengeIds(db, access, auth.user!.uid) : [];
    if (!ids.length) return { user: null, db: null, access: null, response: fail("Enterprise access has expired. Your Personal Workspace and Enterprise history remain available.", 403, undefined, "ENTERPRISE_ACCESS_EXPIRED") };
    if (!access.permissions.includes(permission)) return { user: null, db: null, access: null, response: fail("Your Enterprise role does not include this obligation-management action.", 403, undefined, "ENTERPRISE_PERMISSION_REQUIRED") };
    return { user: auth.user!, db, access, accessState: "obligation_only" as const, obligationChallengeIds: ids, response: null };
  }
  if (!hasEnterprisePermission(access, permission)) return { user: null, db: null, access: null, response: fail("Your Enterprise role does not include this action.", 403, undefined, "ENTERPRISE_PERMISSION_REQUIRED") };
  return { user: auth.user!, db, access, accessState: state, obligationChallengeIds: [] as string[], response: null };
}

export async function requireEnterpriseChallengeAccess(request: Request, challengeId: string, permission: EnterprisePermission, write = false) {
  const result = await requireEnterprisePermission(request, permission, { allowObligationAccess: true });
  if (result.response) return { ...result, challenge: null };
  const snap = await result.db!.collection("challenges").doc(challengeId).get();
  const challenge = snap.exists ? { id: snap.id, ...snap.data() } : null;
  if (!challenge || !enterpriseChallengeInScope(result.access!, challenge, result.user!.uid, write) || (result.accessState === "obligation_only" && !result.obligationChallengeIds.includes(challengeId))) return { ...result, challenge: null, response: fail("This official challenge is outside your Enterprise access scope.", 403, undefined, "ENTERPRISE_SCOPE_DENIED") };
  return { ...result, challenge, response: null };
}

export async function enterpriseProfile(db: Firestore, userId: string) {
  const [userSnap, profileSnap] = await Promise.all([db.collection("users").doc(userId).get(), db.collection("profiles").doc(userId).get()]);
  const profile = { ...(profileSnap.data() ?? {}), ...(userSnap.data() ?? {}) };
  return { profile, access: normalizeEnterpriseAccess(profile) };
}
