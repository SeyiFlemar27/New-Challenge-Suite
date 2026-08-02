import { getAdminAuth, getAdminDb } from "@/lib/firebase/admin";
import { forbidden, serverUnavailable, unauthorized } from "@/lib/server/responses";
import { hasAdminPermission, isAdminRole, resolveAdminPermissions, type AdminPermission, type AdminRole } from "@/lib/server/admin-permissions";

export const SESSION_COOKIE_NAME = "challenge_suite_session";

export interface RequestUser {
  uid: string;
  email?: string;
  role?: string;
  planId?: string;
  isAdmin?: boolean;
  adminRoles?: AdminRole[];
  adminPermissions?: AdminPermission[];
  authTime?: number;
  adminSecondFactorVerified?: boolean;
  adminSecondFactorRequired?: boolean;
  emailVerified?: boolean;
}

export async function getRequestUser(request: Request): Promise<RequestUser | null> {
  const adminAuth = getAdminAuth();
  const db = getAdminDb();
  const authHeader = request.headers.get("authorization");
  const token = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : null;
  const cookieHeader = request.headers.get("cookie") ?? "";
  const sessionCookie = cookieHeader
    .split(";")
    .map((entry) => entry.trim())
    .find((entry) => entry.startsWith(`${SESSION_COOKIE_NAME}=`))
    ?.slice(SESSION_COOKIE_NAME.length + 1);

  if (adminAuth && (token || sessionCookie)) {
    let decoded = null;
    try {
      if (token) decoded = await adminAuth.verifyIdToken(token);
    } catch {
      decoded = null;
    }
    if (!decoded && sessionCookie) {
      try {
        decoded = await adminAuth.verifySessionCookie(decodeURIComponent(sessionCookie), true);
      } catch {
        decoded = null;
      }
    }
    if (!decoded) return null;
    const profileSnap = db ? await db.collection("users").doc(decoded.uid).get() : null;
    const profile = profileSnap?.exists ? profileSnap.data() : {};
    const adminAllowlist = new Set(
      String(process.env.ADMIN_EMAIL_ALLOWLIST ?? "")
        .split(",")
        .map((email) => email.trim().toLowerCase())
        .filter(Boolean)
    );
    const email = String(decoded.email ?? "").toLowerCase();
    const profileRoles = [
      ...(Array.isArray(profile?.adminRoles) ? profile.adminRoles : []),
      ...(typeof profile?.adminRole === "string" ? [profile.adminRole] : [])
    ].filter(isAdminRole);
    const allowlisted = Boolean(email && adminAllowlist.has(email));
    const legacyAdmin = Boolean(decoded.admin === true || profile?.isAdmin || allowlisted);
    const adminRoles: AdminRole[] = profileRoles.length
      ? [...new Set(profileRoles)]
      : legacyAdmin ? [allowlisted ? "platform_owner" : "super_admin"] : [];
    const explicitPermissions = Array.isArray(profile?.adminPermissions)
      ? profile.adminPermissions.filter((permission): permission is string => typeof permission === "string")
      : [];
    const adminPermissions = resolveAdminPermissions(adminRoles, explicitPermissions);
    const firebaseClaims = decoded.firebase as { sign_in_second_factor?: string } | undefined;
    const adminSecondFactorRequired = adminRoles.some((role) => ["platform_owner", "super_admin", "finance_admin", "technical_admin"].includes(role))
      || adminPermissions.some((permission) => ["withdrawals.approve", "withdrawals.secondApprove", "withdrawals.markPaid", "refunds.approve"].includes(permission));
    return {
      uid: decoded.uid,
      email: decoded.email,
      role: decoded.admin === true ? "admin" : profile?.role,
      planId: typeof profile?.planId === "string" ? profile.planId : undefined,
      isAdmin: adminRoles.length > 0,
      adminRoles,
      adminPermissions,
      authTime: typeof decoded.auth_time === "number" ? decoded.auth_time : undefined,
      adminSecondFactorVerified: Boolean(firebaseClaims?.sign_in_second_factor),
      adminSecondFactorRequired,
      emailVerified: Boolean(decoded.email_verified || profile?.emailVerified || profile?.verificationStatus === "verified")
    };
  }

  return null;
}

export async function requireAuthenticatedUser(request: Request) {
  if (!getAdminAuth()) {
    return { user: null, response: serverUnavailable("Authenticated API routes") };
  }
  const user = await getRequestUser(request);
  if (!user) {
    return { user: null, response: unauthorized() };
  }
  return { user, response: null };
}

export async function requireRequestUser(request: Request) {
  const result = await requireAuthenticatedUser(request);
  if (result.response) return result;
  if (!result.user?.emailVerified) {
    return { user: null, response: forbidden("Email verification is required before this action.") };
  }
  return result;
}

export async function getOptionalRequestUser(request: Request) {
  if (!getAdminAuth()) return null;
  return getRequestUser(request);
}

export async function requireAdminUser(request: Request) {
  const result = await requireRequestUser(request);
  if (result.response) return result;
  if (!result.user?.isAdmin) {
    return { user: null, response: forbidden("Admin permission is required.") };
  }
  return result;
}

export async function requireAdminPermission(request: Request, permission: AdminPermission) {
  const result = await requireAdminUser(request);
  if (result.response) return result;
  if (!hasAdminPermission(result.user?.adminPermissions, permission)) {
    return { user: null, response: forbidden(`The ${permission} permission is required.`) };
  }
  return result;
}

export async function requireRecentAdminAuthentication(request: Request, permission: AdminPermission, maximumAgeSeconds = 10 * 60) {
  const result = await requireAdminPermission(request, permission);
  if (result.response) return result;
  const age = Math.floor(Date.now() / 1000) - Number(result.user?.authTime ?? 0);
  if (!result.user?.authTime || age > maximumAgeSeconds) {
    return { user: null, response: forbidden("Recent authentication is required before this sensitive action.") };
  }
  if (result.user.adminSecondFactorRequired && !result.user.adminSecondFactorVerified) {
    return { user: null, response: forbidden("A verified second factor is required before this sensitive action.") };
  }
  return result;
}

export function requireRole(user: RequestUser, roles: string[]) {
  if (!user.role || !roles.includes(user.role)) {
    return forbidden(`This action requires one of these roles: ${roles.join(", ")}.`);
  }
  return null;
}
