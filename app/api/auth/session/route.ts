import { getAdminAuth } from "@/lib/firebase/admin";
import { SESSION_COOKIE_NAME } from "@/lib/server/auth";
import { ok, readJson, serverUnavailable, unauthorized } from "@/lib/server/responses";

const STANDARD_SESSION_DURATION_SECONDS = 60 * 60 * 24;
const REMEMBERED_SESSION_DURATION_SECONDS = 60 * 60 * 24 * 30;

export async function POST(request: Request) {
  const adminAuth = getAdminAuth();
  if (!adminAuth) return serverUnavailable("Session restoration");

  const authHeader = request.headers.get("authorization");
  const idToken = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : "";
  if (!idToken) return unauthorized();
  const parsed = await readJson(request);
  const maxAge = !parsed.response && parsed.body?.rememberMe === true ? REMEMBERED_SESSION_DURATION_SECONDS : STANDARD_SESSION_DURATION_SECONDS;

  try {
    await adminAuth.verifyIdToken(idToken);
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
