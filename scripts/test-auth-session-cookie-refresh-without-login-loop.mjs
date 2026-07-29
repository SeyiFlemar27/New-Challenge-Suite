import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const provider = readFileSync("components/auth-provider.tsx", "utf8");
const guard = readFileSync("components/verification-guard.tsx", "utf8");
const serverAuth = readFileSync("lib/server/auth.ts", "utf8");
const sessionRoute = readFileSync("app/api/auth/session/route.ts", "utf8");

assert(guard.includes("if (loading) return <LoadingGate />"));
assert(guard.includes("Restoring your session..."));
assert(!guard.includes("router.replace("), "the auth guard must not create a redirect loop while Firebase restores.");
assert(serverAuth.includes("verifySessionCookie") && serverAuth.includes("verifyIdToken"), "server auth must support verified cookie and bearer paths.");
assert(serverAuth.includes("profile?.role") && serverAuth.includes("profile?.isAdmin"), "session restoration must preserve role checks from server data.");
assert(sessionRoute.includes("await adminAuth.verifyIdToken(idToken)"), "session cookies must only be minted from verified Firebase tokens.");
assert(sessionRoute.includes("maxAge: SESSION_DURATION_SECONDS"));
assert(sessionRoute.includes("maxAge: 0"), "logout must clear the server session cookie.");

console.log("Auth session-cookie refresh and loop-safety checks passed.");
