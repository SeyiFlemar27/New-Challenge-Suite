import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const firebaseClient = readFileSync("lib/firebase/client.ts", "utf8");
const authService = readFileSync("lib/firebase/auth-service.ts", "utf8");
const provider = readFileSync("components/auth-provider.tsx", "utf8");
const sessionRoute = readFileSync("app/api/auth/session/route.ts", "utf8");

assert(firebaseClient.includes("browserLocalPersistence"), "Firebase auth must persist across same-domain tabs.");
assert(firebaseClient.includes("initializeAuth(firebaseApp, { persistence: browserLocalPersistence })"));
assert(authService.includes('fetch("/api/auth/session"') && authService.includes('credentials: "same-origin"'));
assert(provider.includes("syncServerSession(nextUser)"), "restored Firebase users must sync the server session.");
assert(provider.includes("syncServerSession(nextUser).catch(() => undefined)"), "session sync failure must not discard restored client auth.");
assert(authService.includes("onIdTokenChanged(auth, callback)"), "server session sync must refresh when Firebase rotates the ID token.");
assert(sessionRoute.includes("createSessionCookie"));
assert(sessionRoute.includes("httpOnly: true"));
assert(sessionRoute.includes('sameSite: "lax"'));
assert(!authService.includes("localStorage") && !sessionRoute.includes("searchParams"), "auth tokens must not be stored manually or placed in URLs.");

console.log("Same-domain new-tab auth persistence checks passed.");
