import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();
const read = (file) => readFileSync(join(root, file), "utf8");
const exists = (file) => existsSync(join(root, file));

const createPage = read("app/challenges/create/page.tsx");
const draftApi = read("app/api/challenges/drafts/route.ts");
const loginPage = read("app/auth/login/page.tsx");
const verifyEmailPage = read("app/auth/verify-email/page.tsx");
const apiClient = read("lib/api/client.ts");
const authService = read("lib/firebase/auth-service.ts");
const authProvider = read("components/auth-provider.tsx");

assert(exists("app/challenges/create/page.tsx"), "Create Challenge route must exist.");
assert(exists("app/api/challenges/drafts/route.ts"), "Server-backed draft API must exist.");
assert(exists("app/auth/login/page.tsx"), "Login page must exist.");

assert(createPage.includes("/auth/login?next="), "Create Challenge must redirect unauthenticated users to login with next.");
assert(createPage.includes("encodeURIComponent(createChallengePath)") && createPage.includes("/challenges/create"), "Create Challenge next path must be encoded and point back to /challenges/create.");
assert(createPage.includes("authState.loading") && createPage.includes("useAuth()"), "Create Challenge must wait for auth state before deciding redirect.");
assert(createPage.includes("authState.user ?? firebaseAuth?.currentUser"), "Create Challenge must tolerate the post-login Firebase auth/context handoff.");
assert(createPage.indexOf("if (!activeUser)") < createPage.indexOf("createChallengeDraft()"), "Create Challenge must not create drafts before an authenticated user exists.");
assert(createPage.includes("creatingDraftRef") && createPage.includes("if (creatingDraftRef.current) return"), "Create Challenge must guard against duplicate draft creation loops.");
assert(createPage.includes("UNAUTHENTICATED") && createPage.includes("router.replace(loginContinuationPath)"), "Create Challenge must return to login if the server rejects auth.");
assert(createPage.includes("router.replace(`/challenges/create/${id}`)"), "Authenticated Create Challenge must open the persisted draft editor.");

assert(draftApi.includes("requireRequestUser(request)"), "Draft API must require server-side authenticated user.");
assert(draftApi.includes("if (response) return response"), "Draft API must reject unauthenticated users before creating a draft.");
assert(draftApi.indexOf("requireRequestUser(request)") < draftApi.indexOf("const ref = db.collection(\"challenges\").doc()"), "Draft document must be created only after auth succeeds.");

assert(loginPage.includes("function safeInternalPath") && loginPage.includes("value.startsWith(\"//\")") && loginPage.includes("value.includes(\"://\")"), "Login page must reject unsafe external next URLs.");
assert(loginPage.includes("getNextPath()"), "Login page must centralize next parsing.");
assert(loginPage.includes("router.replace(destination)"), "Successful login must route to next/default without leaving stale login history.");
assert(loginPage.includes("getDefaultRouteForAccount(profile.data.user)"), "Login without next must keep the existing default redirect behavior.");
assert(loginPage.includes("Sign in to continue"), "Login page must show continuation copy when next is present.");
assert(loginPage.includes("router.push(destination ? `/auth/verify-email?returnUrl=${encodeURIComponent(destination)}` : \"/auth/verify-email\")"), "Unverified login must preserve the safe destination through email verification.");
assert(loginPage.includes("setError(error instanceof Error ? error.message : \"Could not sign in.\")"), "Failed login must show a clear error and remain on login page.");

assert(verifyEmailPage.includes("params.get(\"returnUrl\") || params.get(\"next\")"), "Email verification must preserve returnUrl/next continuation.");
assert(verifyEmailPage.includes("!value.includes(\"://\")"), "Email verification must reject unsafe external return URLs.");
assert(verifyEmailPage.includes("router.replace(destination)"), "Email verification must continue to the preserved destination after verification.");

assert(apiClient.includes("Authorization") && apiClient.includes("auth.currentUser.getIdToken()"), "Client API requests must send the Firebase ID token to server routes.");
assert(authService.includes("signInWithEmailAndPassword") && authService.includes("getIdToken(true)"), "Login/bootstrap flow must establish a Firebase user and refreshed token.");
assert(authProvider.includes("listenToAuth") && authProvider.includes("setUser(nextUser"), "Auth provider must still use Firebase auth state, not a second auth system.");

assert(!createPage.includes("createChallengeDraft().then") || createPage.indexOf("if (!activeUser)") < createPage.indexOf("createChallengeDraft().then"), "No draft should be created for unauthenticated users.");
assert(!loginPage.includes("http://") && !loginPage.includes("https://"), "Login continuation must not hard-code external redirects.");

console.log("Create Challenge auth redirect checks passed.");