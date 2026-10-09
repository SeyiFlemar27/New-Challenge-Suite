import { getAdminAuth } from "@/lib/firebase/admin";
import { SESSION_COOKIE_NAME } from "@/lib/server/auth";
import { ok, readJson, serverUnavailable, unauthorized } from "@/lib/server/responses";

const STANDARD_SESSION_DURATION_SECONDS = 60 * 60 * 24;
const REMEMBERED_SESSION_DURATION_SECONDS = 60 * 60 * 24 * 30;
const FIREBASE_SESSION_COOKIE_MAX_SECONDS = 60 * 60 * 24 * 14;

type SessionAuthBoundary = Pick<NonNullable<ReturnType<typeof getAdminAuth>>, "verifyIdToken" | "createSessionCookie">;
let sessionAuthOverride: SessionAuthBoundary | null = null;

export function setSessionAuthForTests(auth: SessionAuthBoundary | null) {
  sessionAuthOverride = auth;
}

export async function POST(request: Request) {
  const adminAuth = sessionAuthOverride ?? getAdminAuth();
  if (!adminAuth) return serverUnavailable("Session restoration");

  const authHeader = request.headers.get("authorization");
  const idToken = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : "";
  if (!idToken) return unauthorized();
  const parsed = await readJson(request);
  const selectedDuration = !parsed.response && parsed.body?.rememberMe === true ? REMEMBERED_SESSION_DURATION_SECONDS : STANDARD_SESSION_DURATION_SECONDS;

  try {
    const decodedToken = await adminAuth.verifyIdToken(idToken, true);
    const authTime = Number(decodedToken.auth_time);
    if (!Number.isFinite(authTime) || authTime <= 0) return unauthorized("Your sign-in could not be verified. Sign in again to continue.");
    const remainingPolicySeconds = Math.floor(authTime + selectedDuration - Date.now() / 1000);
    if (remainingPolicySeconds <= 0) return unauthorized("Your session has expired. Sign in again to continue.");
    // Firebase session cookies expire after at most 14 days. The client keeps
    // the selected 24-hour/30-day absolute policy and renews the cookie from a
    // fresh verified ID token, without extending past auth_time + that policy.
    const maxAge = Math.min(remainingPolicySeconds, FIREBASE_SESSION_COOKIE_MAX_SECONDS);
    const sessionCookie = await adminAuth.createSessionCookie(idToken, {
      expiresIn: maxAge * 1000
    });
    const response = ok({ restored: true }, "Session restored.");
    response.cookies.set({
      name: SESSION_COOKIE_NAME,
      value: sessionCookie,
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "strict",
      path: "/",
      maxAge
    });
    return response;
  } catch {
    return unauthorized("Your session has expired. Sign in again to continue.");
  }
}

export async function DELETE() {
  const response = ok({ restored: false }, "Session cleared.");
  response.cookies.set({
    name: SESSION_COOKIE_NAME,
    value: "",
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict",
    path: "/",
    maxAge: 0
  });
  return response;
}
