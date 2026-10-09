import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { initializeApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import { getRememberMePreference, REMEMBER_ME_STORAGE_KEY, setRememberMePreference } from "../lib/firebase/session-persistence.ts";

assert.ok(process.env.FIRESTORE_EMULATOR_HOST, "FIRESTORE_EMULATOR_HOST is required");
assert.ok(process.env.FIREBASE_AUTH_EMULATOR_HOST, "FIREBASE_AUTH_EMULATOR_HOST is required");
const app = initializeApp({ projectId: process.env.FIREBASE_PROJECT_ID ?? "demo-challenge-suite" });
const db = getFirestore(app);
const { POST, DELETE, setSessionAuthForTests } = await import("../app/api/auth/session/route.ts");
const { getRequestUser, SESSION_COOKIE_NAME } = await import("../lib/server/auth.ts");
const runId = `session_policy_${randomUUID().replaceAll("-", "")}`;
let assertions = 0;
function equal(actual, expected, message) { assert.equal(actual, expected, message); assertions += 1; }
function check(value, message) { assert.ok(value, message); assertions += 1; }

class MemoryStorage {
  values = new Map();
  getItem(key) { return this.values.get(key) ?? null; }
  setItem(key, value) { this.values.set(key, String(value)); }
  removeItem(key) { this.values.delete(key); }
}

function setBrowserStorage(localStorage = new MemoryStorage(), sessionStorage = new MemoryStorage()) {
  globalThis.window = { localStorage, sessionStorage };
  return { localStorage, sessionStorage };
}

function sessionRequest(token, rememberMe) {
  return new Request("http://localhost/api/auth/session", {
    method: "POST",
    headers: { ...(token ? { authorization: `Bearer ${token}` } : {}), "content-type": "application/json" },
    body: JSON.stringify({ rememberMe })
  });
}

async function createAuthUser(label) {
  const email = `${runId}_${label}@example.test`;
  const response = await fetch(`http://${process.env.FIREBASE_AUTH_EMULATOR_HOST}/identitytoolkit.googleapis.com/v1/accounts:signUp?key=fake-api-key`, {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ email, password: "TestPassword123!", returnSecureToken: true })
  });
  const body = await response.json();
  assert.equal(response.ok, true, JSON.stringify(body));
  await db.collection("users").doc(body.localId).set({ email, role: "user", accountStatus: "active", emailVerified: true });
  return { uid: body.localId, token: body.idToken };
}

try {
  const persistentStorage = setBrowserStorage();
  equal(getRememberMePreference(), false, "missing preference defaults to standard duration");
  setRememberMePreference(true);
  equal(getRememberMePreference(), true, "Remember Me selection is persisted for the current session");
  const restoredSession = new MemoryStorage();
  globalThis.window = { localStorage: persistentStorage.localStorage, sessionStorage: restoredSession };
  equal(getRememberMePreference(), true, "Remember Me survives browser-session restoration from persistent preference");
  setRememberMePreference(false);
  equal(getRememberMePreference(), false, "standard selection overrides and clears an older persistent Remember Me preference");
  equal(persistentStorage.localStorage.getItem(REMEMBER_ME_STORAGE_KEY), null, "standard selection does not leave a persistent remember flag");

  let issuedDuration = 0;
  let policyAuthTime = Math.floor(Date.now() / 1000) - 23 * 60 * 60;
  setSessionAuthForTests({
    verifyIdToken: async (_token, checkRevoked) => { equal(checkRevoked, true, "session issuance always checks Firebase token revocation"); return { uid: "policy-user", auth_time: policyAuthTime }; },
    createSessionCookie: async (_token, options) => { issuedDuration = options.expiresIn; return "deterministic-session-cookie"; }
  });
  await POST(sessionRequest("policy-token", false));
  check(issuedDuration > 0 && issuedDuration <= 60 * 60 * 1000 && issuedDuration > 59 * 60 * 1000, "token refresh does not extend a standard session beyond its 24-hour absolute login policy");
  policyAuthTime = Math.floor(Date.now() / 1000) - 23 * 24 * 60 * 60;
  await POST(sessionRequest("policy-token", true));
  check(issuedDuration > 6 * 24 * 60 * 60 * 1000 && issuedDuration <= 7 * 24 * 60 * 60 * 1000, "remembered refresh retains the remaining 30-day absolute login policy");
  policyAuthTime = Math.floor(Date.now() / 1000);
  await POST(sessionRequest("policy-token", true));
  equal(issuedDuration, 14 * 24 * 60 * 60 * 1000, "Remember Me renewals respect Firebase's 14-day per-cookie limit while retaining the longer absolute policy");
  policyAuthTime = Math.floor(Date.now() / 1000) - 25 * 60 * 60;
  equal((await POST(sessionRequest("policy-token", false))).status, 401, "refresh cannot upgrade an expired standard session into a remembered session");
  setSessionAuthForTests({
    verifyIdToken: async () => { throw new Error("auth/id-token-revoked"); },
    createSessionCookie: async () => { throw new Error("revoked token must never reach session-cookie creation"); }
  });
  equal((await POST(sessionRequest("revoked-token", true))).status, 401, "revoked Firebase credentials cannot mint or extend a remembered session");
  setSessionAuthForTests(null);

  const user = await createAuthUser("standard");
  const rememberedUser = await createAuthUser("remembered");
  equal((await POST(sessionRequest(null, true))).status, 401, "session cannot be minted without an authenticated ID token");
  equal((await POST(sessionRequest("not-a-valid-token", true))).status, 401, "invalid ID token is rejected");
  const standardResponse = await POST(sessionRequest(user.token, false));
  equal(standardResponse.status, 200, "verified standard login creates a server session");
  const standardCookie = standardResponse.headers.get("set-cookie") ?? "";
  const standardCookieSeconds = Number(standardCookie.match(/Max-Age=(\d+)/)?.[1] ?? 0);
  check(standardCookieSeconds <= 86_400 && standardCookieSeconds > 86_300, "standard login receives the remaining portion of its 24-hour server session");
  check(standardCookie.includes(`${SESSION_COOKIE_NAME}=`), "server session uses the canonical cookie name");
  const rememberedResponse = await POST(sessionRequest(rememberedUser.token, true));
  if (rememberedResponse.status !== 200) console.error("Remembered session response:", await rememberedResponse.clone().text());
  equal(rememberedResponse.status, 200, "verified Remember Me login creates a server session");
  const rememberedCookie = rememberedResponse.headers.get("set-cookie") ?? "";
  check(rememberedCookie.includes("Max-Age=1209600"), "Remember Me session cookie uses Firebase's maximum 14-day token lifetime and is renewed from the persisted 30-day policy");
  const cookieValue = decodeURIComponent(rememberedCookie.match(new RegExp(`${SESSION_COOKIE_NAME}=([^;]+)`))?.[1] ?? "");
  check(Boolean(cookieValue), "Firebase Auth Emulator returned a session cookie");
  const sessionUser = await getRequestUser(new Request("http://localhost/private", { headers: { cookie: `${SESSION_COOKIE_NAME}=${encodeURIComponent(cookieValue)}` } }));
  equal(sessionUser?.uid, rememberedUser.uid, "restored server session resolves the authenticated user");
  equal(await getRequestUser(new Request("http://localhost/private", { headers: { cookie: `${SESSION_COOKIE_NAME}=invalid` } })), null, "invalid session cookie is rejected");

  const logout = await DELETE();
  equal(logout.status, 200, "logout endpoint succeeds");
  check((logout.headers.get("set-cookie") ?? "").includes("Max-Age=0"), "logout clears the server cookie");
  console.log(`PASS auth session route, revocation, logout, and persisted Remember Me policy against Firebase Auth/Firestore Emulator: ${assertions} assertions.`);
} finally {
  delete globalThis.window;
  await db.terminate();
  await app.delete();
}
