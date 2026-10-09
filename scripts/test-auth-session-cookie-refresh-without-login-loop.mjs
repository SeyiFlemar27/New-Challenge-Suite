import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const provider = readFileSync("components/auth-provider.tsx", "utf8");
const guard = readFileSync("components/verification-guard.tsx", "utf8");
const serverAuth = readFileSync("lib/server/auth.ts", "utf8");
const sessionRoute = readFileSync("app/api/auth/session/route.ts", "utf8");

assert(guard.includes("if (loading) return null"), "session restoration should remain silent while auth state is verified.");
assert(!guard.includes("LoadingGate") && !guard.includes("Restoring your session"), "session restoration must not render a banner or empty loading card.");
assert(!guard.includes("router.replace("), "the auth guard must not create a redirect loop while Firebase restores.");
assert(serverAuth.includes("verifySessionCookie") && serverAuth.includes("verifyIdToken"), "server auth must support verified cookie and bearer paths.");
assert(serverAuth.includes("profile?.role") && serverAuth.includes("profile?.isAdmin"), "session restoration must preserve role checks from server data.");
assert(sessionRoute.includes("await adminAuth.verifyIdToken(idToken, true)"), "session cookies must only be minted from verified, non-revoked Firebase tokens.");
assert(sessionRoute.includes("STANDARD_SESSION_DURATION_SECONDS = 60 * 60 * 24") && sessionRoute.includes("REMEMBERED_SESSION_DURATION_SECONDS = 60 * 60 * 24 * 30"), "server cookie lifetime must preserve standard and Remember Me policies.");
assert(sessionRoute.includes("verifyIdToken(idToken, true)"), "revoked Firebase credentials must not mint or extend a server session.");
assert(sessionRoute.includes("maxAge: 0"), "logout must clear the server session cookie.");

console.log("Auth session-cookie refresh and loop-safety checks passed.");
