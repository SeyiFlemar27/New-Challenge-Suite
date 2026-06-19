import { getAdminAuth, getAdminDb } from "@/lib/firebase/admin";
import { forbidden, serverUnavailable, unauthorized } from "@/lib/server/responses";

export interface RequestUser {
  uid: string;
  email?: string;
  role?: string;
  isAdmin?: boolean;
  emailVerified?: boolean;
}

export async function getRequestUser(request: Request): Promise<RequestUser | null> {
  const adminAuth = getAdminAuth();
  const db = getAdminDb();
  const authHeader = request.headers.get("authorization");
  const token = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : null;

  if (adminAuth && token) {
    let decoded;
    try {
      decoded = await adminAuth.verifyIdToken(token);
    } catch {
      return null;
    }
    const profileSnap = db ? await db.collection("users").doc(decoded.uid).get() : null;
    const profile = profileSnap?.exists ? profileSnap.data() : {};
    return {
      uid: decoded.uid,
      email: decoded.email,
      role: profile?.role,
      isAdmin: Boolean(profile?.isAdmin),
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

export function requireRole(user: RequestUser, roles: string[]) {
  if (!user.role || !roles.includes(user.role)) {
    return forbidden(`This action requires one of these roles: ${roles.join(", ")}.`);
  }
  return null;
}
