import { getAdminDb } from "@/lib/firebase/admin";
import { enterpriseChallengeInScope, hasEnterprisePermission, type EnterprisePermission } from "@/lib/enterprise-access";
import { userOwnsChallenge } from "@/lib/server/challenge-access";
import { enterpriseProfile } from "@/lib/server/enterprise-access";
import { requireRequestUser } from "@/lib/server/auth";
import { fail, serverUnavailable } from "@/lib/server/responses";

export function isOfficialEnterpriseChallenge(challenge: Record<string, unknown>) {
  return challenge.officialChallenge === true
    || challenge.ownershipType === "challenge_suite_official"
    || (typeof challenge.organizationOwnerId === "string" && challenge.organizationOwnerId.trim().length > 0);
}

/**
 * Personal challenges remain creator-owned. Official challenges are never
 * authorized from creatorId: staff must have current Enterprise access and
 * be within their organization/scope for the requested operation.
 */
export async function requireChallengeManagementAccess(request: Request, challengeId: string, permission: EnterprisePermission) {
  const auth = await requireRequestUser(request);
  if (auth.response || !auth.user) return { response: auth.response, user: null, db: null, challenge: null, enterpriseAccess: null };

  const db = getAdminDb();
  if (!db) return { response: serverUnavailable("Challenge management"), user: null, db: null, challenge: null, enterpriseAccess: null };

  const snap = await db.collection("challenges").doc(challengeId).get();
  if (!snap.exists) return { response: fail("Challenge not found.", 404, undefined, "CHALLENGE_NOT_FOUND"), user: null, db: null, challenge: null, enterpriseAccess: null };
  const challenge = { id: snap.id, ...snap.data() } as Record<string, unknown>;

  if (auth.user.isAdmin) return { response: null, user: auth.user, db, challenge, enterpriseAccess: null };
  if (!isOfficialEnterpriseChallenge(challenge)) {
    if (!userOwnsChallenge(challenge, auth.user.uid)) return { response: fail("Challenge management access is restricted to the owner.", 403, undefined, "PERMISSION_DENIED"), user: null, db: null, challenge: null, enterpriseAccess: null };
    return { response: null, user: auth.user, db, challenge, enterpriseAccess: null };
  }

  const { access } = await enterpriseProfile(db, auth.user.uid);
  if (!access || !hasEnterprisePermission(access, permission) || !enterpriseChallengeInScope(access, challenge, auth.user.uid, true)) {
    return { response: fail("Your Enterprise access does not allow this official challenge action.", 403, undefined, "ENTERPRISE_SCOPE_DENIED"), user: null, db: null, challenge: null, enterpriseAccess: null };
  }
  return { response: null, user: auth.user, db, challenge, enterpriseAccess: access };
}
