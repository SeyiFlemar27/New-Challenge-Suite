import assert from "node:assert/strict";
import { randomUUID, randomBytes } from "node:crypto";
import { readFileSync, mkdirSync, writeFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { execFileSync, spawn } from "node:child_process";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import net from "node:net";
import { initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore } from "firebase-admin/firestore";

const require = createRequire(import.meta.url);
const { chromium, expect: baseExpect } = require("@playwright/test");
const expect = baseExpect.configure({ timeout: 15000 });
const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
if (resolve(process.cwd()) !== repoRoot) {
  throw new Error(`Run this browser suite from its repository root: ${repoRoot}`);
}
const tsconfigPath = join(repoRoot, "tsconfig.json");
const originalTsconfig = readFileSync(tsconfigPath, "utf8");
const nextEnvPath = join(repoRoot, "next-env.d.ts");
const originalNextEnv = readFileSync(nextEnvPath, "utf8");
const projectId = process.env.CHALLENGE_SUITE_E2E_PROJECT_ID ?? "demo-challenge-suite";
if (!projectId.startsWith("demo-")) throw new Error("Browser E2E requires an isolated demo-* Firebase project ID.");
// Generate the isolated test vault key after emulators:exec starts this process;
// the Firebase CLI logs its child environment, so never pass this key to the CLI.
process.env.PRIVATE_INVITE_ENCRYPTION_KEY = randomBytes(32).toString("base64");
const host = "127.0.0.1";
function configuredPort(name, fallback) {
  const value = process.env[name] === undefined ? fallback : Number(process.env[name]);
  if (!Number.isInteger(value) || value < 1 || value > 65535) throw new Error(`${name} must be a valid TCP port.`);
  return value;
}
const port = configuredPort("CHALLENGE_SUITE_E2E_WEB_PORT", 3187);
const firestoreEmulatorPort = configuredPort("CHALLENGE_SUITE_E2E_FIRESTORE_PORT", 8080);
const authEmulatorPort = configuredPort("CHALLENGE_SUITE_E2E_AUTH_PORT", 9099);
const storageEmulatorPort = configuredPort("CHALLENGE_SUITE_E2E_STORAGE_PORT", 9199);
// Use Next's canonical localhost origin so dev HMR does not treat the browser
// as a disallowed cross-origin host. Emulator clients keep using 127.0.0.1.
const baseUrl = `http://127.0.0.1:${port}`;
const runId = randomUUID().replaceAll("-", "");
const artifacts = join(tmpdir(), `challenge-suite-p1-browser-${runId}`);
const reusedNextDistDir = process.env.CHALLENGE_SUITE_E2E_PREBUILT_DIST_DIR;
if (reusedNextDistDir && (!/^\.next\/e2e\/[a-f0-9]{32}$/.test(reusedNextDistDir) || process.env.CHALLENGE_SUITE_E2E_NEXT_MODE !== "start" || !existsSync(join(repoRoot, reusedNextDistDir, "BUILD_ID")))) {
  throw new Error("Prebuilt browser verification requires an existing isolated build and explicit start mode; arbitrary paths and unrelated servers are refused.");
}
const isolatedNextDistDir = reusedNextDistDir || `.next/e2e/${runId}`;
mkdirSync(artifacts, { recursive: true });

for (const [name, value] of Object.entries({
  FIREBASE_PROJECT_ID: projectId,
  GOOGLE_CLOUD_PROJECT: projectId,
  GCLOUD_PROJECT: projectId,
  FIREBASE_CLIENT_EMAIL: "",
  FIREBASE_PRIVATE_KEY: "",
  GOOGLE_APPLICATION_CREDENTIALS: "",
  NEXT_PUBLIC_FIREBASE_PROJECT_ID: projectId,
  NEXT_PUBLIC_FIREBASE_API_KEY: "demo-api-key",
  NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN: `${projectId}.firebaseapp.com`,
  NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET: `${projectId}.appspot.com`,
  FIREBASE_STORAGE_BUCKET: `${projectId}.appspot.com`,
  NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID: "1234567890",
  NEXT_PUBLIC_FIREBASE_APP_ID: "1:1234567890:web:demo",
  NEXT_PUBLIC_USE_FIREBASE_EMULATORS: "true",
  NEXT_PUBLIC_FIREBASE_EMULATOR_HOST: host,
  NEXT_PUBLIC_FIREBASE_AUTH_EMULATOR_PORT: String(authEmulatorPort),
  NEXT_PUBLIC_FIREBASE_FIRESTORE_EMULATOR_PORT: String(firestoreEmulatorPort),
  NEXT_PUBLIC_FIREBASE_STORAGE_EMULATOR_PORT: String(storageEmulatorPort),
  CHALLENGE_SUITE_USE_FIREBASE_EMULATORS: "true",
  FIRESTORE_EMULATOR_HOST: `${host}:${firestoreEmulatorPort}`,
  FIREBASE_AUTH_EMULATOR_HOST: `${host}:${authEmulatorPort}`,
  FIREBASE_STORAGE_EMULATOR_HOST: `${host}:${storageEmulatorPort}`,
  NEXT_PUBLIC_DISABLE_MEDIA_UPLOADS: process.env.CHALLENGE_SUITE_E2E_MEDIA_UPLOADS_ENABLED === "true" ? "false" : "true",
  NEXT_PUBLIC_SUPPORT_ATTACHMENT_UPLOADS_ENABLED: "false",
  SUPPORT_ATTACHMENT_UPLOADS_ENABLED: "false",
  NEXT_PUBLIC_INITIAL_ADMIN_EMAILS: "",
  ADMIN_EMAIL_ALLOWLIST: "",
  STRIPE_SECRET_KEY: "",
  STRIPE_WEBHOOK_SECRET: "",
  RESEND_API_KEY: "",
  GOOGLE_CLIENT_ID: "",
  GOOGLE_CLIENT_SECRET: "",
  NEXT_PUBLIC_GOOGLE_CLIENT_ID: "",
  NEXT_PUBLIC_GOOGLE_AUTH_ENABLED: "false"
})) process.env[name] = value;

// Do not let Next load real credentials from the developer's ignored .env.local.
try {
  const localEnv = readFileSync(join(process.cwd(), ".env.local"), "utf8");
  for (const line of localEnv.split(/\r?\n/)) {
    const match = line.match(/^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=/);
    if (match && !(match[1] in process.env)) process.env[match[1]] = "";
  }
} catch { /* .env.local is optional; no values are read or printed. */ }

const firebaseApp = initializeApp({ projectId, storageBucket: `${projectId}.appspot.com` }, `p1-browser-${runId}`);
const authAdmin = getAuth(firebaseApp);
const db = getFirestore(firebaseApp);
const users = {};
const pageErrors = [];
let browser;
let nextProcess;
let buildProcess;
let assertions = 0;
let passed = 0;
const results = [];
const authResponses = [];
const authStorageSnapshots = [];
const browserDiagnostics = [];
const journeyFilter = process.env.CHALLENGE_SUITE_E2E_JOURNEY?.trim().toLowerCase() ?? "";
const navigationTimeoutValue = process.env.CHALLENGE_SUITE_E2E_NAVIGATION_TIMEOUT_MS === undefined
  ? 120000
  : Number(process.env.CHALLENGE_SUITE_E2E_NAVIGATION_TIMEOUT_MS);
if (!Number.isInteger(navigationTimeoutValue) || navigationTimeoutValue < 1000 || navigationTimeoutValue > 600000) {
  throw new Error("CHALLENGE_SUITE_E2E_NAVIGATION_TIMEOUT_MS must be an integer between 1000 and 600000.");
}
const navigationTimeout = navigationTimeoutValue;
const interactionTimeoutValue = process.env.CHALLENGE_SUITE_E2E_INTERACTION_TIMEOUT_MS === undefined
  ? 30000
  : Number(process.env.CHALLENGE_SUITE_E2E_INTERACTION_TIMEOUT_MS);
if (!Number.isInteger(interactionTimeoutValue) || interactionTimeoutValue < 1000 || interactionTimeoutValue > 120000) {
  throw new Error("CHALLENGE_SUITE_E2E_INTERACTION_TIMEOUT_MS must be an integer between 1000 and 120000.");
}
const interactionTimeout = interactionTimeoutValue;

function check(condition, message) {
  assert.ok(condition, message);
  assertions += 1;
}

async function test(name, fn, { requiresMedia = false } = {}) {
  const publishingGroup = /^(Automatic publication:|Media publication|Normal Builder|Tournament V3|Live Event V2 .* builder draft)/.test(name);
  const followUpGroup = /^(Media publication|Live Event V2 .* builder draft)/.test(name);
  const privateAccessGroup = /^(Private requester|Challenge owner approves access request)/.test(name);
  if (journeyFilter && !(journeyFilter === "dashboard redesign" ? name.startsWith("Dashboard redesign:") || name.startsWith("Dashboard stability:") : journeyFilter === "dashboard release" ? publishingGroup || name.startsWith("Dashboard stability:") : journeyFilter === "private access follow-up" ? privateAccessGroup : journeyFilter === "publishing regression" ? publishingGroup : journeyFilter === "publishing follow-up" ? followUpGroup : name.toLowerCase().includes(journeyFilter))) {
    results.push({ name, status: "SKIP", assertions: 0, message: "Filtered out by CHALLENGE_SUITE_E2E_JOURNEY." });
    return;
  }
  if (requiresMedia && process.env.CHALLENGE_SUITE_E2E_MEDIA_UPLOADS_ENABLED !== "true") {
    results.push({ name, status: "SKIP", assertions: 0, message: "Requires CHALLENGE_SUITE_E2E_MEDIA_UPLOADS_ENABLED=true and the isolated Storage emulator." });
    return;
  }
  const assertionsAtStart = assertions;
  try {
    await fn();
    passed += 1;
    const journeyAssertions = assertions - assertionsAtStart;
    results.push({ name, status: "PASS", assertions: journeyAssertions });
    console.log(`PASS ${name} (${journeyAssertions} assertions)`);
  } catch (error) {
    const pages = browser?.contexts().flatMap((context) => context.pages()) ?? [];
    const page = pages.at(-1);
    const pageState = page ? {
      url: page.url(),
      body: await page.locator("body").innerText().catch(() => "").then((value) => value.slice(0, 1200))
    } : undefined;
    results.push({ name, status: "FAIL", assertions: assertions - assertionsAtStart, message: error instanceof Error ? error.message : String(error), pageState });
    console.error(`FAIL ${name}: ${error instanceof Error ? error.message : String(error)}`);
    if (browser) {
      if (page) await page.screenshot({ path: join(artifacts, `failure-${results.length}.png`), fullPage: true }).catch(() => undefined);
    }
  }
}

async function seedUser(label, { role = "user", admin = false, sponsorOrg = null, enterpriseOrg = null } = {}) {
  const email = `${label}-${runId}@example.test`;
  const signUpResponse = await fetch(`http://${host}:${authEmulatorPort}/identitytoolkit.googleapis.com/v1/accounts:signUp?key=demo-api-key`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email, password: "LocalE2E!2345", returnSecureToken: true })
  });
  const signUpResult = await signUpResponse.json();
  if (!signUpResponse.ok || typeof signUpResult.localId !== "string") {
    const errorCode = typeof signUpResult.error?.message === "string" && /^[A-Z0-9_]+$/.test(signUpResult.error.message)
      ? signUpResult.error.message
      : "AUTH_EMULATOR_SIGNUP_FAILED";
    throw new Error(`Could not create isolated browser test account (${errorCode}).`);
  }
  const created = await authAdmin.updateUser(signUpResult.localId, { emailVerified: true, displayName: `Journey ${label}` });
  if (admin) await authAdmin.setCustomUserClaims(created.uid, { admin: true });
  const now = new Date().toISOString();
  const account = {
    uid: created.uid, email, emailVerified: true, verified: true, verificationStatus: "verified",
    role, roleIntent: role, accountType: "user", account_type: role === "creator" ? "creator" : null,
    accountTypeSelectionComplete: true, dashboardType: role === "creator" ? "creator_studio" : "user_dashboard",
    firstName: "Journey", lastName: label, displayName: `Journey ${label}`, isAdmin: admin,
    accountStatus: "active", createdAt: now, updatedAt: now
  };
  const profile = { ...account, profileVisibility: "public", username: `${label}-${runId.slice(0, 6)}`, usernameNormalized: `${label}-${runId.slice(0, 6)}`, onboardingComplete: true };
  if (sponsorOrg) {
    Object.assign(account, { sponsorOrganizationId: sponsorOrg, sponsorAccessStatus: "active", sponsorOnboardingComplete: true, hasSponsorProfile: true, sponsorVerificationStatus: "verified" });
    Object.assign(profile, { sponsorOrganizationId: sponsorOrg, sponsorAccessStatus: "active", sponsorOnboardingComplete: true, hasSponsorProfile: true, sponsorVerificationStatus: "verified" });
  }
  if (enterpriseOrg) {
    Object.assign(account, {
      enterpriseAccessStatus: "approved",
      staffAccess: { organizationId: enterpriseOrg, permissions: ["finance.view", "challenge.view"], role: "finance", scope: "all_official", status: "active", expiresAt: "2099-01-01T00:00:00.000Z", onboardingComplete: true }
    });
    Object.assign(profile, account);
  }
  await Promise.all([
    db.collection("users").doc(created.uid).set(account),
    db.collection("profiles").doc(created.uid).set(profile),
    db.collection("wallets").doc(created.uid).set({ userId: created.uid, balance: 0, currency: "DC", updatedAt: now })
  ]);
  users[label] = { ...created, email, password: "LocalE2E!2345" };
  return users[label];
}

async function login(context, user, { rememberMe = false } = {}) {
  await context.clearCookies();
  const page = await context.newPage();
  page.setDefaultNavigationTimeout(navigationTimeout);
  page.setDefaultTimeout(interactionTimeout);
  page.on("pageerror", (error) => pageErrors.push(`${new URL(page.url()).pathname}: ${error.message}${error.stack ? `\n${error.stack}` : ""}`));
  page.on("console", (message) => { if (message.type() === "error") browserDiagnostics.push(`console ${new URL(page.url()).pathname} ${message.text()}`); });
  page.on("requestfailed", (request) => browserDiagnostics.push(`request ${new URL(request.url()).pathname} ${request.failure()?.errorText ?? "failed"}`));
  page.on("request", (request) => {
    const url = new URL(request.url());
    if (/identitytoolkit\.googleapis\.com|securetoken\.googleapis\.com/.test(url.hostname)) {
      browserDiagnostics.push(`firebase-auth request ${request.method()} ${url.hostname}${url.pathname}`);
    }
    if (/^\/api\/(?:tournaments|live-events)\//.test(url.pathname)) {
      browserDiagnostics.push(`journey-api request ${request.method()} ${url.pathname}`);
    }
    if (url.pathname === "/api/private-exclusive" && request.method() === "POST") {
      browserDiagnostics.push(`private-access-api request ${request.method()} ${url.pathname}`);
    }
  });
  page.on("response", async (response) => {
    if (!response.url().includes("identitytoolkit.googleapis.com") || response.status() < 400) return;
    const payload = await response.json().catch(() => null);
    const errorCode = typeof payload?.error?.message === "string" && /^[A-Z0-9_]+$/.test(payload.error.message)
      ? payload.error.message
      : "UNRECOGNIZED_AUTH_ERROR";
    browserDiagnostics.push(`auth-emulator ${response.status()} ${errorCode}`);
  });
  page.on("response", (response) => { if (response.status() >= 400 && response.url().includes("/_next/")) browserDiagnostics.push(`asset ${response.status()} ${response.url()}`); });
  page.on("response", (response) => {
    if (response.status() >= 400) {
      const url = new URL(response.url());
      browserDiagnostics.push(`http ${response.status()} ${response.request().resourceType()} ${url.pathname}`);
    }
  });
  page.on("response", (response) => {
    const url = new URL(response.url());
    if (url.pathname.startsWith("/api/challenges/")) browserDiagnostics.push(`challenge-api ${response.status()} ${response.request().method()} ${url.pathname}`);
    if (/^\/api\/(?:tournaments|live-events)\//.test(url.pathname)) {
      browserDiagnostics.push(`journey-api response ${response.status()} ${response.request().method()} ${url.pathname}`);
    }
    if (url.pathname === "/api/private-exclusive" && response.request().method() === "POST") {
      browserDiagnostics.push(`private-access-api response ${response.status()} ${response.request().method()} ${url.pathname}`);
    }
  });
  page.on("response", async (response) => {
    if (response.url().includes("/api/auth/")) {
      const path = new URL(response.url()).pathname;
      const item = { status: response.status(), path };
      authResponses.push(item);
      const body = await response.json().catch(() => null);
      if (body && typeof body === "object") {
        const envelope = body.data && typeof body.data === "object" ? body.data : {};
        browserDiagnostics.push(`auth-api ${response.status()} ${path} ok=${String(body.ok)} code=${String(body.code ?? "")} profileExists=${String(envelope.profileExists ?? "")}`);
      }
    }
  });
  await page.goto(`${baseUrl}/auth/login?next=%2Fexplore`, { waitUntil: "domcontentloaded" });
  await page.waitForFunction(() => {
    const loginFormReady = Boolean(document.querySelector('form input[type="email"]'));
    const dashboardActionReady = Array.from(document.querySelectorAll("button")).some((button) => button.textContent?.trim() === "Continue to dashboard");
    return loginFormReady || dashboardActionReady;
  }, null, { timeout: 20000 }).catch(async () => {
    throw new Error(`Authentication page never left its initialization state: ${(await page.locator("main").innerText()).slice(0, 500)}`);
  });
  const continueButton = page.getByRole("button", { name: "Continue to dashboard", exact: true });
  if (await continueButton.count()) {
    const existingIdentity = await page.locator("main").innerText();
    if (existingIdentity.includes(user.displayName)) {
      await continueButton.click();
    } else {
      await page.getByRole("button", { name: /Switch account \/ Sign out/i }).click();
      await page.waitForLoadState("networkidle", { timeout: 12000 }).catch(() => undefined);
    }
  }
  if (page.url().includes("/auth/login")) {
    check(await page.getByRole("button", { name: "Continue with Google", exact: true }).count() === 0, "Google sign-in remains unavailable until explicitly enabled");
    const signInSubmit = page.locator('form button[type="submit"], form button:not([type="button"])');
    const submitCount = await signInSubmit.count();
    if (submitCount !== 1) throw new Error(`Login form must expose exactly one submit control (found ${submitCount}).`);
    await page.getByLabel("Email Address").fill(user.email);
    await page.getByLabel("Password", { exact: true }).fill(user.password);
    if (rememberMe) await page.getByLabel("Remember me on this device").check();
    const enteredEmail = await page.getByLabel("Email Address").inputValue();
    const enteredPassword = await page.getByLabel("Password", { exact: true }).inputValue();
    if (enteredEmail !== user.email || enteredPassword !== user.password) throw new Error("Login fields did not retain entered values before submission.");
    await signInSubmit.click();
  }
  await page.waitForURL("**/explore", { timeout: navigationTimeout }).catch(() => undefined);
  if (new URL(page.url()).pathname !== "/explore") {
    const continueAfterAuth = page.getByRole("button", { name: "Continue to dashboard", exact: true });
    if (await continueAfterAuth.count()) {
      await continueAfterAuth.click();
      await page.waitForURL("**/explore", { timeout: navigationTimeout }).catch(() => undefined);
    }
  }
  if (new URL(page.url()).pathname !== "/explore") {
    const body = (await page.locator("body").innerText()).slice(0, 1200);
    const formValues = await page.locator("form input").evaluateAll((inputs) => inputs.map((input) => ({ type: input.type, value: input.value })));
    throw new Error(`Login did not reach Explore; current URL=${page.url()}; body=${body}; formValues=${JSON.stringify(formValues)}; authResponses=${JSON.stringify(authResponses)}; diagnostics=${JSON.stringify(browserDiagnostics)}`);
  }
  await page.getByText("Loading your workspace...", { exact: true }).waitFor({ state: "hidden", timeout: 20000 }).catch(() => undefined);
    await page.getByRole("heading", { name: "Explore Challenges" }).waitFor({ timeout: navigationTimeout });
  authStorageSnapshots.push(await page.evaluate(async () => ({
    localStorageKeys: Object.keys(localStorage),
    sessionStorageKeys: Object.keys(sessionStorage),
    databases: (await indexedDB.databases()).map((database) => database.name)
  })));
  return page;
}

const nextMode = process.env.CHALLENGE_SUITE_E2E_NEXT_MODE === "dev"
  ? "dev"
  : process.env.CHALLENGE_SUITE_E2E_NEXT_MODE === "start" ? "start" : "production";
const serverEnv = { ...process.env, NODE_ENV: nextMode === "dev" ? "development" : "production", NEXT_TELEMETRY_DISABLED: "1" };
const localEnvNames = (() => {
  try { return readFileSync(join(process.cwd(), ".env.local"), "utf8").split(/\r?\n/).map((line) => line.match(/^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=/)?.[1]).filter(Boolean); }
  catch { return []; }
})();
for (const name of localEnvNames) if (serverEnv[name] === undefined) serverEnv[name] = "";
serverEnv.CHALLENGE_SUITE_NEXT_DIST_DIR = isolatedNextDistDir;
const nextEntrypoint = join(repoRoot, "node_modules", "next", "dist", "bin", "next");
const nextBundler = process.env.CHALLENGE_SUITE_E2E_NEXT_BUNDLER === "turbo" ? "--turbo" : "--webpack";
const serverLog = [];
const expectedServerUrl = `http://127.0.0.1:${port}`;

function assertPortAvailable(targetPort) {
  return new Promise((resolvePromise, rejectPromise) => {
    const probe = net.createServer();
    probe.once("error", () => rejectPromise(new Error(`Browser E2E port ${targetPort} is already in use; refusing to attach to an unrelated server.`)));
    probe.listen(targetPort, "127.0.0.1", () => probe.close((error) => error ? rejectPromise(error) : resolvePromise()));
  });
}

// `serverLog` is populated only from the child started by this runner.
function attachServerLogs(child) {
  child.stdout.on("data", (chunk) => serverLog.push(String(chunk)));
  child.stderr.on("data", (chunk) => serverLog.push(String(chunk)));
}

async function waitForServer() {
  const deadline = Date.now() + 120000;
  while (Date.now() < deadline) {
    if (!nextProcess || nextProcess.exitCode !== null) throw new Error(`Next.js exited before ready. ${serverLog.join("").slice(-5000)}`);
    const logs = serverLog.join("");
    if (logs.includes(expectedServerUrl)) {
      try {
        const response = await fetch(`${baseUrl}/auth/login`);
        const contentType = response.headers.get("content-type") ?? "";
        const html = await response.text();
        if (response.status === 200) {
          const loginMarker = /Sign In|Loading sign-in|Preparing your workspace|We couldn't open your workspace/i.test(html);
          if (contentType.includes("text/html") && loginMarker) return;
          if(nextMode==="dev"&&contentType.includes("text/html")){
            // Development renders the root shell before client hydration. Require
            // the real accessible login control in a browser, not merely HTTP 200.
            const probe=await chromium.launch({headless:true,channel:"chrome"});
            try{const page=await probe.newPage();await page.goto(`${baseUrl}/auth/login`,{waitUntil:"domcontentloaded",timeout:navigationTimeout});await page.getByRole("button",{name:"Sign In",exact:true}).waitFor({state:"visible",timeout:interactionTimeout});return;}
            finally{await probe.close();}
          }
          throw new Error(`Runner-owned Next.js returned HTTP 200 for /auth/login but failed route readiness (contentType=${contentType || "missing"}, loginMarker=${loginMarker}, bodyLength=${html.length}). ${logs.slice(-1800)}`);
        }
        if (response.status === 404) throw new Error(`The runner-owned Next.js server returned HTTP 404 for /auth/login. ${logs.slice(-5000)}`);
        if (response.status >= 500) throw new Error(`The runner-owned Next.js server returned HTTP ${response.status} for /auth/login. ${logs.slice(-5000)}`);
      } catch (error) {
        if (error instanceof Error && (error.message.includes("HTTP 404") || error.message.includes("HTTP 5") || error.message.includes("failed route readiness"))) throw error;
      }
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new Error(`Next.js did not become ready. ${serverLog.join("").slice(-5000)}`);
}

async function waitForChild(child, label) {
  if (child.exitCode !== null) {
    if (child.exitCode !== 0) throw new Error(`${label} exited with code ${child.exitCode}. ${serverLog.join("").slice(-7000)}`);
    return;
  }
  await new Promise((resolvePromise, rejectPromise) => {
    child.once("error", rejectPromise);
    child.once("exit", (code, signal) => {
      if (code === 0) resolvePromise(undefined);
      else rejectPromise(new Error(`${label} exited with ${signal ? `signal ${signal}` : `code ${code}`}. ${serverLog.join("").slice(-7000)}`));
    });
  });
}

function removeNextGeneratedTsconfigIncludes() {
  const generatedIncludes = [
    `${isolatedNextDistDir}/types/**/*.ts`,
    `${isolatedNextDistDir}/dev/types/**/*.ts`
  ];
  const originalIncludes = new Set(JSON.parse(originalTsconfig).include ?? []);
  const removable = generatedIncludes.filter((include) => !originalIncludes.has(include));
  if (!removable.length) return;

  const current = readFileSync(tsconfigPath, "utf8");
  let updated = current;
  const currentConfig = JSON.parse(current);
  const cleanedConfig = { ...currentConfig, include: (currentConfig.include ?? []).filter((include) => !removable.includes(include)) };
  if (JSON.stringify(cleanedConfig) === JSON.stringify(JSON.parse(originalTsconfig))) {
    writeFileSync(tsconfigPath, originalTsconfig);
    return;
  }
  const includeArray = /("include"\s*:\s*)\[([\s\S]*?)\]/m.exec(updated);
  if (!includeArray) return;

  let body = includeArray[2];
  for (const include of removable) {
    const quoted = JSON.stringify(include).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    body = body.replace(new RegExp(`(^|\\r?\\n)(\\s*)${quoted},?`, "m"), "$1");
  }
  body = body.replace(/,(\s*)$/, "$1");
  updated = `${updated.slice(0, includeArray.index)}${includeArray[1]}[${body}]${updated.slice(includeArray.index + includeArray[0].length)}`;
  try {
    JSON.parse(updated);
    if (updated !== current) writeFileSync(tsconfigPath, updated);
  } catch (error) {
    browserDiagnostics.push(`runner cleanup could not remove generated tsconfig includes: ${error instanceof Error ? error.message : "invalid JSON"}`);
    process.exitCode = 1;
  }
}

function restoreNextGeneratedRouteTypeImport() {
  const current = readFileSync(nextEnvPath, "utf8");
  if (current === originalNextEnv) return;
  const originalImport = originalNextEnv.match(/import\s+(["'])([^"']*routes\.d\.ts)\1;/);
  if (!originalImport) return;
  const generatedImportPath = `./${isolatedNextDistDir}/dev/types/routes.d.ts`;
  const generatedImport = new RegExp(`import\\s+(["'])${generatedImportPath.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\1;`);
  const restoredImport = `import ${originalImport[1]}${originalImport[2]}${originalImport[1]};`;
  const productionGeneratedImport = new RegExp(`import\\s+(["'])\\./${isolatedNextDistDir}/types/routes\\.d\\.ts\\1;`);
  const updated = current.replace(generatedImport, restoredImport).replace(productionGeneratedImport, restoredImport);
  if (updated === originalNextEnv) writeFileSync(nextEnvPath, updated);
}

try {
  await assertPortAvailable(port);
  if (nextMode === "production") {
    buildProcess = spawn(process.execPath, [nextEntrypoint, "build"], { cwd: repoRoot, env: serverEnv, stdio: ["ignore", "pipe", "pipe"] });
    attachServerLogs(buildProcess);
    await waitForChild(buildProcess, "Isolated Next.js production build");
    buildProcess = undefined;
  }
  const nextArgs = [nextEntrypoint, nextMode === "production" ? "start" : nextMode, "-H", "127.0.0.1", "-p", String(port)];
  if (nextMode === "dev") nextArgs.push(nextBundler);
  nextProcess = spawn(process.execPath, nextArgs, { cwd: repoRoot, env: serverEnv, stdio: ["ignore", "pipe", "pipe"] });
  attachServerLogs(nextProcess);
  const creator = await seedUser("creator", { role: "creator" });
  const participant = await seedUser("participant");
  const sponsor = await seedUser("sponsor", { role: "user", sponsorOrg: `org_${runId}` });
  const enterprise = await seedUser("enterprise", { enterpriseOrg: `enterprise_${runId}` });
  const admin = await seedUser("admin", { admin: true });
  const sponsorOrg = `org_${runId}`;
  const enterpriseOrg = `enterprise_${runId}`;
  await Promise.all([
    db.collection("sponsorOrganizations").doc(sponsorOrg).set({ id: sponsorOrg, name: "Journey Sponsor", status: "active", sponsorOnboardingComplete: true, verificationStatus: "verified", primary: true }),
    db.collection("sponsorMemberships").doc(`membership_${runId}`).set({ id: `membership_${runId}`, sponsorOrganizationId: sponsorOrg, userId: sponsor.uid, role: "owner", status: "active" }),
    db.collection("enterpriseOrganizations").doc(enterpriseOrg).set({ id: enterpriseOrg, status: "active" }),
    db.collection("enterpriseFinanceWallets").doc(enterpriseOrg).set({ organizationId: enterpriseOrg, currency: "USD", pendingBalanceCents: 0, lifetimeChallengeRevenueCents: 0, withdrawalsEnabled: false })
  ]);
  const publicChallengeId = `journey_${runId}_normal`;
  const publicChallengeTitle = `Autumn Portrait Challenge ${runId.slice(0, 6)}`;
  const privateChallengeId = `journey_${runId}_private`;
  const liveEventId = `journey_${runId}_event`;
  const tournamentId = `journey_${runId}_tournament`;
  const tournamentMatchId = `${tournamentId}_round1_match1`;
  const tournamentRoundId = `${tournamentId}_round1`;
  const now = new Date().toISOString();
  const past = new Date(Date.now() - 3600000).toISOString();
  const future = new Date(Date.now() + 86400000).toISOString();
  await Promise.all([
    db.collection("challenges").doc(publicChallengeId).set({
      id: publicChallengeId, creatorId: creator.uid, creatorName: "Journey creator", title: publicChallengeTitle,
      shortDescription: "A browser journey challenge fixture.", description: "Create a portrait entry.", category: "Photography",
      type: "standard", visibility: "public", status: "published", lifecycleStatus: "published", sponsorReady: true,
      startsAt: past, registrationDeadline: future, submissionDeadline: future, votingDeadline: future,
      createdAt: now, publishedAt: now, updatedAt: now, participantCount: 0, maxParticipants: 50,
      mediaUploadStatus: "verified", mediaStatus: "verified", challengeRules: ["Be respectful"], prizeValue: 0
    }),
    db.collection("challenges").doc(privateChallengeId).set({
      id: privateChallengeId, creatorId: creator.uid, creatorName: "Journey creator", title: "Locked Art Opportunity",
      shortDescription: "A locked opportunity for browser journey verification.", category: "Art", type: "Private / Exclusive",
      visibility: "private", publicPreviewEnabled: true, privateAccessMethod: "invite_link", privateJoiningPolicy: "invite_and_request", status: "registration_open",
      lifecycleStatus: "registration_open", startsAt: past, registrationDeadline: future, submissionDeadline: future,
      votingDeadline: future, createdAt: now, updatedAt: now, maxParticipants: 20, participantCount: 0
    }),
    db.collection("enterpriseChallenges").doc(`${runId}_official`).set({ organizationId: enterpriseOrg, status: "active", title: "Enterprise operations fixture", createdAt: now })
    ,db.collection("liveEvents").doc(liveEventId).set({
      id: liveEventId, title: "In-Person Art Gathering", hostId: creator.uid, hostName: "Journey creator",
      description: "A physical event registration fixture.", status: "scheduled",eventApprovalStatus:"approved",visibility:"public", startsAt: future,
      date: future, time: "10:00", location: "Lagos", venueName: "Community Arts Hall", eventAddress: "1 Test Lane",
      price: 0, ticketType: "General attendee access", capacity: 25, attending: 0, registrationCount: 0,
      createdAt: now, updatedAt: now
    }),
    db.collection("tournaments").doc(tournamentId).set({
      id: tournamentId, hostId: creator.uid, createdBy: creator.uid, title: "Journey Individual Tournament",
      shortDescription: "Browser registration fixture.", description: "An individual tournament for UI registration verification.",
      category: "Art", status: "registration_open", format: "single_elimination", participationMode: "individual",
      participantCapacity: 16, participantCount: 0, privacy: "public", registrationType: "open",
      roundPlan: [], registrationOpensAt: past, registrationClosesAt: future, tournamentStartsAt: future,
      expectedEndAt: new Date(Date.now() + 172800000).toISOString(), entryType: "free", entryFeeAmountMinor: null,
      currency: "USD", eligibility: {}, requiresCheckIn: false, checkInClosesAt: null, teamConfig: null,
      seedingMethod: "registration_order", resultMethod: "judges", advancementMethod: "bracket", voting: { enabled: false },
      judging: { enabled: true }, tieBreaker: "host_review", thirdPlaceMethod: "none", scoreVisibility: "hidden",
      prizeDistribution: [], readiness: {}, currentRoundId: null, currentRoundNumber: 0, prizePool: { status: "setup_required" },
      sponsorship: {}, dispute: {}, cancellationRefund: {}, hostManagement: {}, createdAt: now, updatedAt: now, publishedAt: now
    })
  ]);

  await waitForServer();
  browser = await chromium.launch({ headless: true, channel: "chrome" });
  browser.on("context", (context) => {
    context.setDefaultNavigationTimeout(navigationTimeout);
    context.setDefaultTimeout(interactionTimeout);
  });
  const desktop = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  if (journeyFilter === 'dashboard redesign') {
    const { dashboardRedesignJourneys } = await import('./dashboard-redesign-journeys.mjs');
    await dashboardRedesignJourneys({browser,test,check,expect,db,seedUser,baseUrl,artifacts,join,pageErrors});
  }

  if (!journeyFilter || journeyFilter === "dashboard stability" || journeyFilter === "dashboard release" || (journeyFilter === "dashboard redesign" && process.env.CHALLENGE_SUITE_DASHBOARD_VISUAL_PHASE !== "before")) {
    const { dashboardProviderRaceFixture } = await import("./dashboard-provider-race-fixture.mjs");
    await dashboardProviderRaceFixture({ browser, test, check, expect, baseUrl });
    const { dashboardAuthJourneys } = await import("./dashboard-auth-journeys.mjs");
    await dashboardAuthJourneys({ browser, test, check, expect, db, authAdmin, seedUser, baseUrl, artifacts, join, pageErrors });
  }

  for (const kind of ["normal", "private", "tournament", "attendance_only", "physical_competition"]) await test(`Automatic publication: ${kind} upload, save, restore, Publish and public refresh`, async () => {
    const owner = await seedUser(`automatic-${kind}`, { role: "creator" });
    await Promise.all([db.collection("users").doc(owner.uid).update({ planId: "host", planStatus: "active", creatorOnboardingComplete: true, hostOnboardingComplete: true }), db.collection("profiles").doc(owner.uid).update({ planId: "host", planStatus: "active", creatorOnboardingComplete: true, hostOnboardingComplete: true })]);
    const context = await browser.newContext({ viewport: { width: kind === "private" ? 390 : 1440, height: 1000 } });
    const page = await login(context, owner, { rememberMe: true });
    const signedIn = await fetch(`http://${host}:${authEmulatorPort}/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=demo`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ email: owner.email, password: owner.password, returnSecureToken: true }) });
    const signed = await signedIn.json(), headers = { authorization: `Bearer ${signed.idToken}` };
    const { freshNormalChallengeForm } = await import("../../lib/normal-challenge-builder-model.ts");
    const { normalFrontendPayload } = await import("../../lib/normal-challenge-frontend.ts");
    const form = freshNormalChallengeForm();
    Object.assign(form, { title: `Creator publication ${kind}`, description: "A complete ordinary creator competition with optional media left blank.", category: "Fitness", subcategory: "", images: [], numberOfWinners: 2, confirmations: { accurate: false, rights: false, review: false } });
    let payload = normalFrontendPayload(form);
    const tournament = kind === "tournament", live = kind === "attendance_only" || kind === "physical_competition";
    if (kind === "private") Object.assign(payload, { challengeType: "private", type: "Private Challenge", visibility: "private", privateAccessPolicyVersion: 2, privateAccessMethod: "invitation_code", privateJoiningPolicy: "invite_only", privateVotingAccess: "access_restricted", publicPreviewEnabled: true });
    if (live) { const at = hours => new Date(Date.now() + hours * 3600000).toISOString(); payload = { title: form.title, description: form.description, category: "Fitness", type: "Live Event", challengeType: "live_event", builderVersion: "live_event_v2", isLiveEvent: true, visibility: "public", competitionFormat: "physical_event", acceptedSubmissionTypes: [], startsAt: at(48), endsAt: at(52), timeZone: "Africa/Lagos", venueName: "Community hall", eventAddress: "Community road", eventCity: "Lagos", eventCountry: "NG", eventCapacity: 20, maxParticipants: 20, capacityMode: "limited", prizeType: "bragging_rights", prizeValue: 0, hostOperations: { schemaVersion: 2, currentStep: "media", eventFormat: kind, timezone: "Africa/Lagos", registrationOpensAt: at(1), registrationClosesAt: at(47), checkInStartAt: at(47), checkInEndAt: at(50), ticketPrice: kind === "attendance_only" ? 10 : 0, competitionEntryFee: 0, competitorCapacity: kind === "physical_competition" ? 4 : 0, physicalJudgeCount: 1, winnerCount: 1, eventRules: ["Respect others"], admissionRefundPolicy: "standard", detailsConfirmed: false, mediaRightsConfirmed: false } }; }
    if (tournament) payload = { title: form.title, description: form.description, category: "Gaming", participantCapacity: 4, participationMode: "individual", format: "single_elimination", entryType: "free", basePrizeAmountMinor: 0, submissionDurationHours: 12, votingDurationHours: 12, status: "draft" };
    const created = await page.request.post(baseUrl + (tournament ? "/api/tournaments" : live ? "/api/challenges" : "/api/challenges/drafts"), { headers, data: payload }), createdBody = await created.json();
    check(created.ok() && createdBody.ok, `real draft creation ${kind}: ${created.status()} ${JSON.stringify(createdBody)}`);
    const id = (tournament ? createdBody.data.tournament : createdBody.data.challenge).id, ref = db.collection(tournament ? "tournaments" : "challenges").doc(id);
    await ref.update(tournament ? { builderCurrentStep: "media", builderUnlockedStep: "media", builderNavigationVersion: 2 } : live ? { "hostOperations.currentStep": "media" } : { builderCurrentStep: 3, maxUnlockedStep: 3, ...(kind === "private" ? { privateBuilderStep: 2 } : {}) });
    const builderUrl = tournament ? `/tournaments/create?draft=${id}` : live ? `/host/live/create?draftId=${id}` : `/${kind === "private" ? "private" : "challenges"}/create/${id}`;
    await page.goto(baseUrl + builderUrl, { waitUntil: "domcontentloaded" });
    const image = await require("sharp")({ create: { width: 137, height: 91, channels: 3, background: "gold" } }).png().toBuffer();
    const fileInput = live ? page.locator('input[type="file"]').first() : page.getByLabel(tournament ? "Cover image file" : "Image 1 file", { exact: true });
    const verified = page.waitForResponse(response => new URL(response.url()).pathname === "/api/creator-media/verify" && response.request().method() === "POST");
    await fileInput.setInputFiles({ name: "creator-cover.png", mimeType: "image/png", buffer: image });
    check((await verified).status() === 200, "real creator upload and decoding succeeded");
    await expect(page.getByText("Upload complete.", { exact: true }).first()).toBeVisible();
    const savePath = tournament ? `/api/tournaments/${id}` : `/api/challenges/drafts/${id}`;
    const saved = page.waitForResponse(response => new URL(response.url()).pathname === savePath && response.request().method() === "PATCH" && response.ok());
    await page.getByRole("button", { name: "Continue", exact: true }).click(); await saved;
    await page.reload({ waitUntil: "domcontentloaded" });
    check(Boolean(tournament ? (await ref.get()).data().coverMedia?.path : live ? (await ref.get()).data().coverImagePath : (await ref.get()).data().challengeImages?.[0]?.path), "media survives saved draft restoration");
    for (let step = 0; step < 8; step++) {
      const action = page.getByRole("button", { name: /^(Continue|Publish)$/ }).last();
      await expect(action).toBeVisible();
      if ((await action.innerText()).trim() === "Publish") break;
      const continued = page.waitForResponse(response => new URL(response.url()).pathname === savePath && response.request().method() === "PATCH");
      await action.click();
      check((await continued).ok(), "builder step saved");
    }
    if (live) {
      await page.getByLabel("The event details are accurate.", { exact: true }).check();
      await page.getByLabel("I have permission to use the uploaded content.", { exact: true }).check();
      if (kind === "attendance_only") await expect(page.getByText(/Event information can be published/)).toBeVisible();
    } else if (tournament) {
      await page.getByLabel("I confirm the Tournament information is accurate.", { exact: true }).check();
      await page.getByLabel("I have the rights and permission to use the uploaded media.", { exact: true }).check();
    } else {
      await page.getByLabel("I confirm the challenge details are accurate.", { exact: true }).check();
      await page.getByLabel("I have the rights to publish the content and media.", { exact: true }).check();
    }
    const publishedResponse = page.waitForResponse(response => new URL(response.url()).pathname === (tournament ? `/api/tournaments/${id}` : `/api/challenges/${id}/publish`) && response.request().method() === (tournament ? "PATCH" : "POST"));
    await page.getByRole("button", { name: "Publish", exact: true }).last().click();
    const response = await publishedResponse, envelope = await response.json();
    check(response.ok() && envelope.ok, `Publish click succeeded ${kind}: ${response.status()} ${JSON.stringify(envelope)}`);
    await expect(page.getByRole("heading", { name: tournament ? "Tournament Published" : live ? "Event published" : "Challenge Published", exact: true })).toBeVisible();
    const record = (await ref.get()).data();
    check(record.publicationOutcome === "published" && record.publishedAt && record.status !== "pending_review" && record.adminReviewRequired !== true, "automatic publication persisted");
    check(!record.trailerVideoPath && !record.trailerPath, "optional video stayed blank");
    const publicUrl = tournament ? `/tournaments/${id}` : live ? `/live-events/${id}` : kind === "private" ? `/private/preview/${id}` : `/challenges/${id}`;
    const publicContext = await browser.newContext({ viewport: { width: kind === "private" ? 390 : 1440, height: 1000 } }), publicPage = await publicContext.newPage();
    await publicPage.goto(baseUrl + publicUrl, { waitUntil: "domcontentloaded" });
    await expect(publicPage.getByRole("heading", { name: record.title, exact: true }).first()).toBeVisible();
    await publicPage.reload({ waitUntil: "domcontentloaded" });
    await expect(publicPage.getByRole("heading", { name: record.title, exact: true }).first()).toBeVisible();
    const discovery = await publicPage.request.get(baseUrl + "/api/explore/challenges?type=" + (kind === "private" ? "private" : tournament ? "tournament" : live ? "live_event" : "normal") + "&q=" + encodeURIComponent(record.title));
    const discovered = await discovery.json(); check(discovery.ok() && discovered.data.challenges.some(row => row.id === id), "Explore type filter and search find the published record");
    if (tournament) await expect(publicPage.getByText(/Registration Temporarily Unavailable/).first()).toBeVisible();
    if (kind === "attendance_only") await expect(publicPage.getByText(/Paid booking unavailable|Paid checkout unavailable|Paid entry unavailable/).first()).toBeVisible();
    await publicPage.screenshot({ path: join(artifacts, `automatic-${kind}-public.png`), fullPage: true });
    await publicContext.close(); await context.close();
  }, { requiresMedia: true });

  await test("Media publication and private credential preparation, reveal and copy", async () => {
    const owner = await seedUser("mediapublisher", { role: "creator" });
    await Promise.all([db.collection("users").doc(owner.uid).update({ planId: "creator", planStatus: "active", creatorOnboardingComplete: true }), db.collection("profiles").doc(owner.uid).update({ planId: "creator", planStatus: "active", creatorOnboardingComplete: true })]);
    const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, permissions: ["clipboard-read", "clipboard-write"] });
    const page = await login(context, owner, { rememberMe: true });
    page.on("response", async (response) => {
      if (response.status() >= 400 && new URL(response.url()).pathname.startsWith("/api/challenges/drafts/")) {
        const body = await response.json().catch(() => null);
        browserDiagnostics.push(`media-draft failure ${response.status()} ${body?.code ?? "UNKNOWN"}`);
      }
    });
    const fixtureSignIn = await fetch(`http://${host}:${authEmulatorPort}/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=fake`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ email: owner.email, password: owner.password, returnSecureToken: true }) });
    const fixtureAuth = await fixtureSignIn.json();
    check(fixtureSignIn.ok && !!fixtureAuth.idToken, "fixture setup uses a verified Auth Emulator ID token");
    const fixtureHeaders = { authorization: `Bearer ${fixtureAuth.idToken}` };
    const fixture = JSON.parse(execFileSync(process.execPath, ["--experimental-transform-types", "--experimental-loader", "./scripts/ts-alias-loader.mjs", "--input-type=module", "-e", "import {freshNormalChallengeForm} from './lib/normal-challenge-builder-model.ts';import {normalFrontendPayload} from './lib/normal-challenge-frontend.ts';const f=freshNormalChallengeForm();Object.assign(f,{title:'Browser media publication fixture',description:'An isolated browser fixture for real image upload and review submission.',category:'Fitness',subcategory:'Strength'});console.log(JSON.stringify(normalFrontendPayload(f)));"], { cwd: repoRoot, encoding: "utf8" }));
    const sharp = require("sharp");
    const image = await sharp({ create: { width: 31, height: 17, channels: 3, background: "#456" } }).png().withMetadata({ density: 300 }).toBuffer();
    for (const kind of ["normal", "private"]) {
      const payload = { ...fixture, ...(kind === "private" ? { challengeType: "private", type: "Private Challenge", visibility: "private", privateAccessPolicyVersion: 2, privateAccessMethod: "invite_link", privateJoiningPolicy: "invite_only", publicPreviewEnabled: false, privateVotingAccess: "access_restricted" } : {}) };
      const created = await page.request.post(`${baseUrl}/api/challenges/drafts`, { headers: fixtureHeaders, data: payload });
      const envelope = await created.json();
      check(created.ok() && envelope.ok, `${kind} authenticated draft creation succeeds (HTTP ${created.status()}, code ${envelope.code ?? "OK"})`);
      const id = envelope.data.challenge.id, ref = db.collection("challenges").doc(id);
      // Only the isolated demo fixture starts at Media with earlier fields complete.
      await ref.update({ builderCurrentStep: 3, maxUnlockedStep: 3, ...(kind === "private" ? { privateBuilderStep: 2 } : {}) });
      await page.goto(`${baseUrl}/${kind === "private" ? "private" : "challenges"}/create/${id}`, { waitUntil: "domcontentloaded" });
      const verification = page.waitForResponse((r) => new URL(r.url()).pathname === "/api/creator-media/verify" && r.request().method() === "POST");
      await page.getByLabel("Image 1 file", { exact: true }).setInputFiles({ name: "browser-cover.png", mimeType: "image/png", buffer: image });
      check((await verification).status() === 200, `${kind} actual uploaded image is verified by the server`);
      await expect(page.getByRole("paragraph").filter({ hasText: "Upload complete." })).toBeVisible();
      for (let n = 0; n < 3; n++) await page.getByRole("button", { name: "Continue", exact: true }).click();
      if (kind === "private") {
        await page.getByLabel("Invitation Method", { exact: true }).selectOption("invitation_code");
        await expect(page.getByText("Invitation Code Prepared", { exact: true })).toBeVisible({ timeout: interactionTimeout });
        check(true, "Access displays server-confirmed code preparation without exposing the code");
        const before = (await db.collection("privateCredentialVault").doc(id).get()).data().inviteId;
        await page.reload({ waitUntil: "domcontentloaded" });
        await expect(page.getByText("Invitation Code Prepared", { exact: true })).toBeVisible();
        check((await db.collection("privateCredentialVault").doc(id).get()).data().inviteId === before, "reload preserves the same prepared credential");
        await page.screenshot({ path: join(artifacts, "private-code-prepared.png"), fullPage: true });
        await page.getByRole("button", { name: "Continue", exact: true }).click();
      }
      await page.getByRole("button", { name: "Continue", exact: true }).click();
      await page.getByLabel("I confirm the challenge details are accurate.", { exact: true }).check();
      await page.getByLabel("I have the rights to publish the content and media.", { exact: true }).check();
      const submitted = page.waitForResponse((r) => new URL(r.url()).pathname === `/api/challenges/${id}/publish` && r.request().method() === "POST");
      await page.getByRole("button", { name: "Publish", exact: true }).last().click();
      check((await submitted).status() === 200, `${kind} browser Publish succeeds`);
      await expect(page.getByRole("heading", { name: "Challenge Published" })).toBeVisible();
      check((await ref.get()).data().publicationOutcome === "published", `${kind} published status is authoritative`);
      if (kind === "private") {
        await page.getByRole("link", { name: "Share & Manage Access", exact: true }).click();
        await page.waitForURL(`${baseUrl}/challenges/${id}/access`);
        // Local registration-window fixture; no Admin editorial action.
        await ref.update({ status: "registration_open", registrationOpensAt: new Date(Date.now() - 60000).toISOString() });
        await page.reload({ waitUntil: "domcontentloaded" });
        await page.getByRole("button", { name: "Reveal Code", exact: true }).click();
        const shown = await page.getByLabel("Revealed Invitation Code", { exact: true }).inputValue();
        check(shown.length === 10, "eligible creator explicitly reveals the server-created code");
        await page.getByRole("button", { name: "Copy Code", exact: true }).click();
        await expect(page.getByRole("status")).toContainText("Code copied successfully");
        check(await page.evaluate(() => navigator.clipboard.readText()) === shown, "Copy Code writes the revealed credential to the clipboard");
        check(await page.evaluate((secret) => !Object.values(localStorage).some((value) => value.includes(secret)), shown), "credential is never persisted in browser local storage");
        await page.getByRole("button", { name: "Hide invitation", exact: true }).click();
      }
    }
    const linkDraft = await page.request.post(`${baseUrl}/api/challenges/drafts`, { headers: fixtureHeaders, data: { ...fixture, challengeType: "private", type: "Private Challenge", visibility: "private", privateAccessPolicyVersion: 2, privateAccessMethod: "invite_link" } });
    const linkId = (await linkDraft.json()).data.challenge.id;
    await db.collection("challenges").doc(linkId).update({ status: "registration_open", registrationOpensAt: new Date(Date.now() - 60000).toISOString() });
    await page.goto(`${baseUrl}/challenges/${linkId}/access`, { waitUntil: "domcontentloaded" });
    await page.getByRole("button", { name: "Copy Invite Link", exact: true }).click();
    await expect(page.getByRole("status")).toContainText("Invite Link copied successfully");
    check((await page.evaluate(() => navigator.clipboard.readText())).startsWith(`${baseUrl}/private/invite/`), "Copy Invite Link uses the authorized server credential");
    await context.close();
  }, { requiresMedia: true });

  await test("Normal Builder seven-step frontend, optional fields, creator funding and safe draft exit", async () => {
    const builderUser = await seedUser("normalbuilder", { role: "creator" });
    await Promise.all([db.collection("users").doc(builderUser.uid).update({ planId: "creator", planStatus: "active", creatorOnboardingComplete: true }), db.collection("profiles").doc(builderUser.uid).update({ planId: "creator", planStatus: "active", creatorOnboardingComplete: true })]);
    const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
    const page = await login(context, builderUser, { rememberMe: true });
    await page.goto(`${baseUrl}/challenges/create`, { waitUntil: "domcontentloaded" });
    await page.getByLabel("Challenge title *", { exact: true }).waitFor();
    check(await page.getByText("Choose challenge type", { exact: true }).count() === 0, "Normal opens directly at Overview");
    const navigation = page.getByRole("navigation", { name: "Challenge builder steps" });
    check(await navigation.getByRole("button").count() === 7, "exactly seven visible steps");
    check(!(await navigation.innerText()).includes("Participation"), "no Participation step");
    await page.getByLabel("Challenge title *", { exact: true }).fill("Normal frontend verification");
    await page.getByLabel("Category", { exact: true }).selectOption("Fitness");
    await page.getByLabel("Subcategory", { exact: true }).selectOption("Strength");
    await page.getByLabel("Full description *", { exact: true }).fill("An isolated local fixture for the approved Normal Builder frontend.");
    await page.getByRole("button", { name: "Add Rule", exact: true }).click();
    await page.getByLabel("Challenge rules 1", { exact: true }).fill("Respect every participant.");
    const creationResponse = page.waitForResponse((response) => new URL(response.url()).pathname === "/api/challenges/drafts" && response.request().method() === "POST");
    await page.getByRole("button", { name: "Continue", exact: true }).click();
    const created = await creationResponse; const envelope = await created.json();
    check(created.ok() && envelope.ok, "Overview creates a real authorized emulator draft");
    const draftId = envelope.data.challenge.id; const draftRef = db.collection("challenges").doc(draftId);
    await page.getByLabel("Base prize (USD)", { exact: true }).waitFor();
    await expect(page.getByText("No Base Prize funding required", { exact: true }), "blank Base Prize does not create funding").toBeVisible({ timeout: interactionTimeout });
    check(true, "blank Base Prize does not create funding");
    await page.getByLabel("Open this challenge to sponsors", { exact: true }).check();
    check(await page.getByLabel("Sponsor support focus (optional)").count() === 0 && await page.getByLabel("Sponsor note").count() === 0, "no sponsor-preference fields");
    await page.getByLabel("Base prize (USD)", { exact: true }).fill("100");
    await expect(page.getByText("Creator funding required", { exact: true }), "unfunded positive Base Prize state").toBeVisible({ timeout: interactionTimeout });
    check(true, "unfunded positive Base Prize state");
    await page.getByRole("button", { name: "Continue", exact: true }).click();
    await page.getByText("Add a cover image and optional additional images.", { exact: true }).waitFor();
    check(!(await page.locator("main").innerText()).includes("712 x 430"), "media guidance is clean");
    const image = await require("sharp")({ create: { width: 800, height: 500, channels: 3, background: "#f5d90a" } }).png().toBuffer();
    await page.locator('input[type="file"]').first().setInputFiles({ name: "normal-cover.png", mimeType: "image/png", buffer: image });
    await page.getByText("Upload complete.", { exact: true }).first().waitFor({ timeout: 30000 });
    await page.getByRole("button", { name: "Continue", exact: true }).click();
    await page.getByLabel("Timezone", { exact: true }).waitFor();
    await page.getByRole("button", { name: "Continue", exact: true }).click();
    await page.getByText(/^Voting is automatic:/).waitFor();
    check(await page.getByText("Submission Instructions (optional)", { exact: true }).isVisible(), "instructions are optional");
    check(await page.getByLabel("Voting configuration", { exact: true }).count() === 0, "creator voting selector is removed under the automatic policy");
    await page.getByRole("button", { name: "Continue", exact: true }).click();
    await page.locator("[data-builder-surface]").getByRole("heading", { name: "Review Your Challenge", exact: true }).waitFor();
    check(!(await page.locator("main").innerText()).includes("Participant visibility"), "Review omits Participation");
    check((await page.locator("[data-builder-surface]").innerText()).includes("An isolated local fixture for the approved Normal Builder frontend.") && (await page.locator("[data-builder-surface]").innerText()).includes("Respect every participant."), "Review renders the actual description and creator rules");
    await page.getByRole("button", { name: "Continue", exact: true }).click();
    await page.locator("[data-builder-surface]").getByRole("heading", { name: "Ready to Submit?", exact: true }).waitFor();
    check(await page.getByRole("button", { name: "Publish", exact: true }).last().isDisabled(), "unfunded and server-incompatible draft cannot submit");
    check((await page.locator("main").innerText()).includes("Fund the remaining $100.00"), "accurate outstanding amount");
    await navigation.getByRole("button", { name: "Monetization & Prize Pool", exact: true }).click();
    // These are explicit demo-server fixtures, not simulated live Stripe confirmation.
    const creatorFundingRef=db.collection("creatorPrizeFundingPayments").doc(`${draftId}_browser_funding`);
    await creatorFundingRef.set({challengeId:draftId,userId:builderUser.uid,amountCents:6000,currency:"USD",paymentPurpose:"prize_pool_funding",status:"confirmed",webhookConfirmed:true});
    await page.getByRole("button", { name: "Refresh funding status", exact: true }).click();
    await page.getByText("Partially funded", { exact: true }).waitFor();
    check((await page.locator("main").innerText()).includes("Outstanding: $40.00"), "partial creator funding never counts as fully funded");
    await draftRef.update({ confirmedCreatorPrizeFundingCents: 10000, "monetization.status": "active_foundation", "monetization.paymentActive": true, "monetization.checkoutActive": true });
    await creatorFundingRef.update({amountCents:10000});
    await page.getByRole("button", { name: "Refresh funding status", exact: true }).click();
    await page.getByText("Fully creator-funded", { exact: true }).waitFor();
    check(await page.getByLabel("Base prize (USD)", { exact: true }).isDisabled(), "confirmed monetary commitment is protected from accidental editing");
    await navigation.getByRole("button", { name: "Entry & Submission", exact: true }).click();
    await page.getByRole("button", { name: "Add Instruction", exact: true }).click();
    await page.getByLabel("Submission instruction 1", { exact: true }).fill("An optional saved instruction.");
    await page.getByRole("button", { name: "Add Instruction", exact: true }).click();
    await page.getByLabel("Submission instruction 2", { exact: true }).fill("A second optional instruction.");
    await page.getByRole("button", { name: "Move instruction 2 up", exact: true }).click();
    check(await page.getByLabel("Submission instruction 1", { exact: true }).inputValue() === "A second optional instruction.", "instruction order can be changed");
    await navigation.getByRole("button", { name: "Review", exact: true }).click();
    const instructionReview = await page.locator("[data-builder-surface]").innerText();
    check(instructionReview.includes("A second optional instruction.") && instructionReview.indexOf("A second optional instruction.") < instructionReview.indexOf("An optional saved instruction."), "Review preserves actual ordered instructions");
    await navigation.getByRole("button", { name: /Publish$/ }).click();
    await page.getByLabel("I confirm the challenge details are accurate.", { exact: true }).check();
    await page.getByLabel("I have the rights to publish the content and media.", { exact: true }).check();
    check(await page.getByRole("button", { name: "Publish", exact: true }).last().isEnabled(), "full authoritative creator funding satisfies the frontend checkpoint when all other requirements are valid");
    // Never invoke publication or a payment: verify gating only using demo funding records.
    await navigation.getByRole("button", { name: "Entry & Submission", exact: true }).click();
    await page.getByRole("button", { name: "Remove instruction 2", exact: true }).click();
    await page.getByRole("button", { name: "Remove instruction 1", exact: true }).click();
    check(await page.getByLabel("Submission instruction 1", { exact: true }).count() === 0, "all instructions can be removed");
    await page.setViewportSize({ width: 390, height: 844 });
    await page.getByRole("button", { name: "Builder Guide", exact: true }).click();
    await page.getByRole("dialog", { name: "Builder Guide" }).waitFor();
    await page.keyboard.press("Escape");
    check(await page.getByRole("dialog", { name: "Builder Guide" }).count() === 0, "Guide dismisses on Escape");
    check(await page.getByRole("button", { name: "Builder Guide", exact: true }).evaluate((element) => element === document.activeElement), "Guide restores focus");
    check(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), "Normal Builder fits mobile width");
    await page.screenshot({ path: join(artifacts, "normal-builder-mobile.png"), fullPage: true });
    await page.setViewportSize({ width: 768, height: 1024 });
    check(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), "Normal Builder fits tablet width");
    await page.screenshot({ path: join(artifacts, "normal-builder-tablet.png"), fullPage: true });
    await page.setViewportSize({ width: 1440, height: 1000 });
    const draftPath = `/api/challenges/drafts/${draftId}`;
    await page.route(`**${draftPath}`, async (route) => route.request().method() === "PATCH" ? route.fulfill({ status: 503, contentType: "application/json", body: JSON.stringify({ ok: false, code: "SERVER_UNAVAILABLE", message: "Isolated save failure fixture" }) }) : route.continue());
    await page.getByRole("button", { name: "Finish Later", exact: true }).click();
    await page.getByText("We couldn't save your changes. Check your connection and try again.", { exact: true }).first().waitFor();
    check(new URL(page.url()).pathname.includes(draftId), "failed Finish Later stays on the draft");
    await page.unroute(`**${draftPath}`);
    await page.getByRole("button", { name: "Try Again", exact: true }).click();
    await page.getByText("We couldn't save your changes. Check your connection and try again.", { exact: true }).first().waitFor({ state: "hidden" });
    check(new URL(page.url()).pathname.includes(draftId), "successful save retry clears the error without leaving the draft");
    await page.getByRole("button", { name: "Finish Later", exact: true }).click();
    await page.waitForURL("**/challenges");
    const saved = (await draftRef.get()).data();
    check(saved.submissionInstructionsList.length === 0 && saved.votingSettings.allowPaidVotes === true, "latest optional instructions and existing voting setting persist before leaving");
    check(saved.builderCurrentStep === 5, "wire step remains compatible with the existing server");
    check(saved.monetization.status === "active_foundation" && saved.monetization.paymentActive === true && saved.monetization.checkoutActive === true, "frontend draft saves preserve authoritative financial status flags");
    check(saved.status === "draft", "no false submission success or financial operation occurs");
    await context.close();

    const legacyFreeUser = await seedUser("normalfreelegacy", { role: "creator" });
    const legacyContext = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
    const legacyPage = await login(legacyContext, legacyFreeUser);
    await legacyPage.goto(`${baseUrl}/challenges/create`, { waitUntil: "domcontentloaded" });
    await legacyPage.getByLabel("Challenge title *", { exact: true }).fill("Legacy voting compatibility");
    await legacyPage.getByLabel("Category", { exact: true }).selectOption("Fitness");
    await legacyPage.getByLabel("Subcategory", { exact: true }).selectOption("Strength");
    await legacyPage.getByLabel("Full description *", { exact: true }).fill("A local fixture for preserving a restored voting configuration.");
    const legacyCreationResponse = legacyPage.waitForResponse((response) => new URL(response.url()).pathname === "/api/challenges/drafts" && response.request().method() === "POST");
    await legacyPage.getByRole("button", { name: "Continue", exact: true }).click();
    const legacyCreation = await legacyCreationResponse;
    const legacyEnvelope = await legacyCreation.json();
    check(legacyCreation.ok() && legacyEnvelope.ok, `Free fixture creates a draft through the actual UI (HTTP ${legacyCreation.status()}, code=${legacyEnvelope.code ?? "OK"})`);
    const legacyId = legacyEnvelope.data.challenge.id;
    await legacyPage.getByLabel("Base prize (USD)", { exact: true }).waitFor();
    await legacyPage.getByRole("button", { name: "Finish Later", exact: true }).click();
    await legacyPage.waitForURL("**/challenges");
    await db.collection("challenges").doc(legacyId).update({ "votingSettings.allowPaidVotes": true, "monetization.paidVotesRequested": true, builderCurrentStep: 5, maxUnlockedStep: 5 });
    await legacyPage.goto(`${baseUrl}/challenges/create/${legacyId}`, { waitUntil: "domcontentloaded" });
    await legacyPage.getByText(/^Voting is automatic:/).waitFor();
    check((await legacyPage.locator("[data-normal-step-heading]").innerText()) === "Entry & Submission", "legacy wire position five restores to Entry & Submission");
    check(await legacyPage.getByLabel("Voting configuration", { exact: true }).count() === 0, "restored unpublished Free draft uses automatic voting without a creator selector");
    check((await legacyPage.locator("main").innerText()).includes("5 DoroCoins"), "restored draft explains the real per-vote cost rather than a plan-gated creator option");
    await legacyContext.close();
  }, { requiresMedia: true });

  await test("Creator login establishes a server session and Explore renders API-backed challenge", async () => {
    const page = await login(desktop, creator);
    const cookie = (await page.context().cookies()).find((item) => item.name === "challenge_suite_session");
    check(Boolean(cookie?.httpOnly), "Login should establish an HttpOnly server session cookie.");
    const exploreResponse = await page.request.get(`${baseUrl}/api/explore/challenges?q=${encodeURIComponent(publicChallengeTitle)}`);
    check(exploreResponse.ok(), `Explore API should return success (HTTP ${exploreResponse.status()}).`);
    const exploreData = await exploreResponse.json();
    check(exploreData.data?.challenges?.some((item) => item.id === publicChallengeId), "Seeded published challenge should be returned by Explore API.");
    await page.getByPlaceholder("Search challenges, creators, categories").fill(publicChallengeTitle);
    await page.getByRole("button", { name: "Search", exact: true }).click();
    await page.getByRole("heading", { name: publicChallengeTitle, exact: true }).first().waitFor({ timeout: 15000 });
    check(await page.getByRole("heading", { name: publicChallengeTitle, exact: true }).count() > 0, "Explore UI should render the API-backed challenge.");
    await page.screenshot({ path: join(artifacts, "creator-explore-desktop.png"), fullPage: true });
  });

  await test("Private requester submits access request through UI and persisted request is pending", async () => {
    const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
    const page = await login(context, participant, { rememberMe: true });
    await page.goto(`${baseUrl}/private-exclusive`, { waitUntil: "domcontentloaded" });
    await page.getByRole("heading", { name: "Locked Art Opportunity", exact: true }).first().waitFor({ timeout: 15000 }).catch(async () => {
      const response = await page.request.get(`${baseUrl}/api/private-exclusive`);
      const body = await response.text();
      const storage = await page.evaluate(async () => ({ localStorageKeys: Object.keys(localStorage), sessionStorageKeys: Object.keys(sessionStorage), databases: (await indexedDB.databases()).map((database) => database.name) }));
      throw new Error(`Private UI did not render the public locked preview; API HTTP ${response.status()} body=${body.slice(0, 1600)}; page=${(await page.locator("body").innerText()).slice(0, 1000)}; storage=${JSON.stringify(storage)}`);
    });
    const opportunity = page.getByRole("heading", { name: "Locked Art Opportunity", exact: true }).locator("..");
    await opportunity.getByRole("button", { name: "Request Access", exact: true }).click();
    await page.getByLabel("Reason for access").fill("I would like to join this art challenge.");
    const accessRequestResponse = page.waitForResponse((response) => {
      return new URL(response.url()).pathname === "/api/private-exclusive" && response.request().method() === "POST";
    }, { timeout: interactionTimeout });
    await page.getByRole("button", { name: "Send Request" }).click();
    const requestResponse = await accessRequestResponse;
    const requestEnvelope = await requestResponse.json().catch(() => null);
    check(requestResponse.ok() && requestEnvelope?.ok === true, `Private access request API should accept the submitted form (HTTP ${requestResponse.status()}, code=${String(requestEnvelope?.code ?? "unknown")}).`);
    check(requestEnvelope.data?.requestId === `${privateChallengeId}_${participant.uid}`, "request targets the intended challenge and authenticated participant");
    await page.getByText(/Request: pending review/i).waitFor({ timeout: 15000 });
    const stored = await db.collection("privateAccessRequests").doc(`${privateChallengeId}_${participant.uid}`).get();
    check(stored.exists && stored.data()?.status === "pending_review", "UI request must persist a pending Firestore access request.");
    check(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), "Private access page should not overflow at mobile width.");
    await page.screenshot({ path: join(artifacts, "private-access-mobile.png"), fullPage: true });
    await context.close();
  });

  await test("Challenge owner approves access request through owner UI and grant persists", async () => {
    const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
    const page = await login(context, creator, { rememberMe: true });
    await page.goto(`${baseUrl}/challenges/${privateChallengeId}/access`, { waitUntil: "domcontentloaded" });
    await page.getByText("I would like to join this art challenge.").waitFor({ timeout: 15000 }).catch(async () => {
      const response = await page.request.get(`${baseUrl}/api/private-exclusive?challengeId=${privateChallengeId}`);
      throw new Error(`Owner UI did not render the persisted request; API HTTP ${response.status()} body=${(await response.text()).slice(0, 1600)}; page=${(await page.locator("body").innerText()).slice(0, 1000)}`);
    });
    await page.getByRole("button", { name: "Approve" }).click();
    const confirmation = page.getByRole("region", { name: "Confirm access change" });
    await confirmation.getByLabel("Decision reason").fill("Approved local test request after reviewing eligibility.");
    await confirmation.getByLabel("I confirm this access change.").check();
    const approvalResponse = page.waitForResponse((response) => new URL(response.url()).pathname === `/api/private-challenges/${privateChallengeId}/access` && response.request().method() === "POST");
    await confirmation.getByRole("button", { name: "Confirm change", exact: true }).click();
    const approved = await approvalResponse;
    const approvalEnvelope = await approved.json();
    check(approved.ok() && approvalEnvelope.ok === true, "Owner confirmation must succeed through the authorized access API.");
    const grant = await db.collection("privateChallengeAccess").doc(`${privateChallengeId}_${participant.uid}`).get();
    check(grant.exists && grant.data()?.status === "approved", "Owner UI approval must create a durable server access grant.");
    check((await db.collection("challengeParticipants").doc(`${privateChallengeId}_${participant.uid}`).get()).exists === false, "Access approval alone must not enroll the requester as a participant.");
    await context.close();
  });

  await test("Participant joins a free Normal Challenge through the UI and Firestore records one participant", async () => {
    const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
    const page = await login(context, participant, { rememberMe: true });
    const detailsResponsePromise = page.waitForResponse((response) => new URL(response.url()).pathname === `/api/challenges/${publicChallengeId}` && response.request().method() === "GET", { timeout: navigationTimeout });
    await page.goto(`${baseUrl}/challenges/${publicChallengeId}/join`, { waitUntil: "domcontentloaded" });
    const detailsResponse = await detailsResponsePromise;
    const detailsEnvelope = await detailsResponse.json().catch(() => null);
    check(detailsResponse.ok() && detailsEnvelope?.ok === true, `Join page challenge details must load (HTTP ${detailsResponse.status()}, code=${String(detailsEnvelope?.code ?? "unknown")}).`);
    const viewerState = detailsEnvelope.data?.userState;
    check(viewerState?.submitted === false && viewerState?.submissionId === null, "An unsubmitted participant must not receive a nonexistent submission ID.");
    await page.waitForFunction(() => Array.from(document.querySelectorAll("h1,h2,h3")).some((heading) => /Submit Entry|Challenge Not Found|Challenge Unavailable/.test(heading.textContent ?? "")), null, { timeout: navigationTimeout });
    const agreement = page.getByLabel("I accept the challenge rules, voting policy, and prize terms.");
    await agreement.waitFor({ timeout: interactionTimeout });
    await agreement.check();
    await page.getByRole("button", { name: "Join Challenge", exact: true }).click();
    await page.getByRole("button", { name: /View My Entry|Enter Challenge|Join Challenge/ }).waitFor({ timeout: 15000 }).catch(() => undefined);
    const participantRecord = await db.collection("challengeParticipants").doc(`${publicChallengeId}_${participant.uid}`).get();
    check(participantRecord.exists, "Normal Challenge join UI must persist the participant record.");
    check(["registered", "active", "joined", "approved"].includes(String(participantRecord.data()?.status)), `Free registration should create an admitted participant status; persisted=${JSON.stringify(participantRecord.data())}.`);
    check(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), "Normal join flow must fit a mobile viewport.");
    await page.screenshot({ path: join(artifacts, "normal-challenge-join-mobile.png"), fullPage: true });
    await context.close();
  });

  await test("Sponsor opportunity discovery and Enterprise finance routes render for authorized workspaces", async () => {
    const sponsorContext = await browser.newContext({ viewport: { width: 1365, height: 900 } });
    const sponsorPage = await login(sponsorContext, sponsor, { rememberMe: true });
    const sponsorDiscoveryResponsePromise = sponsorPage.waitForResponse((response) => {
      return new URL(response.url()).pathname === "/api/sponsor/discover/challenges";
    }, { timeout: navigationTimeout });
    await sponsorPage.goto(`${baseUrl}/sponsor/discover/challenges`, { waitUntil: "domcontentloaded" });
    await sponsorPage.getByRole("heading", { name: "Sponsorship opportunities", exact: true }).waitFor({ timeout: 15000 }).catch(async () => {
      throw new Error(`Sponsor UI did not render its heading; page=${(await sponsorPage.locator("body").innerText()).slice(0, 1000)}`);
    });
    check(await sponsorPage.locator("main").count() > 0, "Sponsor discovery route should render its authenticated workspace shell.");
    const sponsorApi = await sponsorDiscoveryResponsePromise;
    check(sponsorApi.ok(), `Sponsor discovery API should authorize the seeded owner (HTTP ${sponsorApi.status()}).`);
    const sponsorData = await sponsorApi.json();
    check(sponsorData.ok === true && sponsorData.data?.challenges?.some((item) => item.id === publicChallengeId), "Sponsor UI API should return the published Sponsor-ready challenge.");
    await sponsorPage.getByRole("heading", { name: publicChallengeTitle, exact: true }).first().waitFor({ timeout: 15000 });
    check(await sponsorPage.getByRole("heading", { name: publicChallengeTitle, exact: true }).count() > 0, "Sponsor discovery UI should render the API-backed opportunity.");
    await sponsorContext.close();

    const enterpriseContext = await browser.newContext({ viewport: { width: 1365, height: 900 } });
    const enterprisePage = await login(enterpriseContext, enterprise, { rememberMe: true });
    const enterpriseFinanceResponsePromise = enterprisePage.waitForResponse((response) => {
      return new URL(response.url()).pathname === "/api/enterprise/finance";
    }, { timeout: navigationTimeout });
    await enterprisePage.goto(`${baseUrl}/enterprise/finance`, { waitUntil: "domcontentloaded" });
    await enterprisePage.getByRole("heading", { name: /Enterprise Finance/i }).waitFor({ timeout: 15000 });
    const financeApi = await enterpriseFinanceResponsePromise;
    check(financeApi.ok(), `Enterprise finance API should authorize the seeded finance member (HTTP ${financeApi.status()}).`);
    const finance = await financeApi.json();
    check(finance.ok === true && finance.data?.organizationId === enterpriseOrg, "Finance response must remain scoped to the authorized organization.");
    await enterpriseContext.close();
  });

  await test("Tournament V3 seven-step draft, verified review media and accessible 128-slot bracket", async () => {
    const owner = await seedUser("tournamentbuilder", { role: "creator" });
    await Promise.all([db.collection("users").doc(owner.uid).update({ planId: "creator", planStatus: "active", creatorOnboardingComplete: true }), db.collection("profiles").doc(owner.uid).update({ planId: "creator", planStatus: "active", creatorOnboardingComplete: true })]);
    const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
    const page = await login(context, owner, { rememberMe: true });
    await page.goto(`${baseUrl}/tournaments/create`, { waitUntil: "domcontentloaded" });
    await page.getByLabel("Tournament title", { exact: true }).waitFor();
    const navigation = page.getByRole("navigation", { name: "Challenge builder steps" });
    check(await navigation.getByRole("button").count() === 7, "Tournament Builder has exactly seven visible steps");
    await page.getByLabel("Tournament title", { exact: true }).fill("Verified Tournament browser draft");
    await page.getByLabel("Category", { exact: true }).selectOption("Gaming");
    await page.getByLabel("Subcategory", { exact: true }).selectOption("Console");
    await page.getByLabel("Full description", { exact: true }).fill("A local Tournament fixture covering real draft, media, review and navigation behavior.");
    await page.getByRole("button", { name: "Add Rule", exact: true }).click();
    await page.getByLabel("Rule 1", { exact: true }).fill("Respect all competitors.");
    const creation = page.waitForResponse(response => new URL(response.url()).pathname === "/api/tournaments" && response.request().method() === "POST");
    await page.getByRole("button", { name: "Continue", exact: true }).click();
    const created = await creation, envelope = await created.json();
    check(created.ok() && envelope.ok, `Tournament draft persists through the actual API (HTTP ${created.status()})`);
    const draftId = envelope.data.tournament.id;
    await page.locator("[data-builder-surface]").getByRole("button", { name: /^Team\b/ }).click();
    await page.getByRole("button", { name: /^Double Elimination/ }).click();
    await page.getByRole("combobox", { name: /^Bracket size/ }).selectOption("128");
    await page.getByRole("button", { name: "Continue", exact: true }).click();
    check(await page.getByLabel("Team payment window", { exact: true }).inputValue() === "60", "team payment defaults to the approved 60-minute window");
    await page.getByLabel("Team payment window", { exact: true }).selectOption("30");
    await page.getByRole("button", { name: "Continue", exact: true }).click();
    await page.getByLabel("Creator-funded Base Prize (USD, optional)", { exact: true }).fill("100");
    await page.getByLabel("Open this tournament to sponsors", { exact: true }).check();
    await page.getByRole("button", { name: "Continue", exact: true }).click();
    const { default: sharp } = await import("sharp");
    const png = await sharp({ create: { width: 32, height: 24, channels: 3, background: "#b58a2a" } }).png().toBuffer();
    await page.locator('input[type="file"]').first().setInputFiles({ name: "tournament-cover.png", mimeType: "image/png", buffer: png });
    await page.getByText("Upload complete.", { exact: true }).first().waitFor({ timeout: 30000 });
    await page.getByRole("button", { name: "Continue", exact: true }).click();
    check(await page.getByRole("combobox", { name: /^Submission duration/ }).inputValue() === "48", "submission duration defaults to 48 hours");
    check(await page.getByRole("combobox", { name: /^Voting duration/ }).inputValue() === "72", "voting duration defaults to 72 hours");
    await page.getByRole("button", { name: "Add Instruction", exact: true }).click();
    await page.getByLabel("Instruction 1", { exact: true }).fill("First instruction");
    await page.getByRole("button", { name: "Add Instruction", exact: true }).click();
    await page.getByLabel("Instruction 2", { exact: true }).fill("Second instruction");
    await page.getByRole("button", { name: "Move instruction 2 up", exact: true }).click();
    check(await page.getByLabel("Instruction 1", { exact: true }).inputValue() === "Second instruction", "Tournament instructions retain their edited order");
    await page.getByRole("button", { name: "Continue", exact: true }).click();
    await page.locator("[data-builder-surface]").getByRole("heading", { name: "Review & Publish", exact: true }).waitFor();
    check((await page.locator("[data-builder-surface]").innerText()).includes("Outstanding: $100.00"), "Review shows the real unfunded creator obligation");
    check(await page.getByRole("button", { name: "Publish", exact: true }).last().isDisabled(), "positive unfunded Base Prize cannot be submitted");
    await page.getByRole("button", { name: "Edit Monetization & Prize Pool", exact: true }).click();
    await page.getByLabel("Creator-funded Base Prize (USD, optional)", { exact: true }).fill("0");
    await navigation.getByRole("button", { name: /Review & Publish/ }).click();
    await page.getByLabel("I confirm the Tournament information is accurate.", { exact: true }).check();
    await page.getByLabel("I have the rights and permission to use the uploaded media.", { exact: true }).check();
    const publication = page.waitForResponse(response => new URL(response.url()).pathname === `/api/tournaments/${draftId}` && response.request().method() === "PATCH" && response.request().postDataJSON()?.status === "pending_review");
    await page.getByRole("button", { name: "Publish", exact: true }).last().click();
    const submitted = await publication, submittedBody = await submitted.json();
    check(submitted.ok() && submittedBody.ok, `Tournament submits through actual media verification (HTTP ${submitted.status()})`);
    const saved = (await db.collection("tournaments").doc(draftId).get()).data();
    check(saved.publicationOutcome === "published" && saved.teamConfig.captainPaysEntryFee === false && saved.teamPaymentWindowMinutes === 30, "published Tournament preserves the individual-member payment model and chosen window");
    check(saved.creatorMediaVerification.cover.path.startsWith(`verified-tournament-media/${draftId}/`), "review references immutable verified promotional bytes");
    const anonymous = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
    const publicPage = await anonymous.newPage();
    check((await anonymous.request.get(`${baseUrl}/api/tournaments/${draftId}`)).status() === 200, "published Tournament is public without Admin approval");
    // Explicit demo data tests rendering at scale; engine progression has separate actual-handler tests.
    const bracketId = `bracket_${runId}`;
    await db.collection("tournaments").doc(bracketId).set({ id: bracketId, hostId: owner.uid, title: "128-slot rendering fixture", description: "A public rendering fixture with no live competition or financial activity.", privacy: "public", status: "round_active", configVersion: 3, format: "single_elimination", participationMode: "individual", participantCapacity: 128, participantCount: 128, submissionDurationHours: 48, votingDurationHours: 72, prizeDistribution: [{ placement: 1, percent: 60 }, { placement: 2, percent: 25 }, { placement: 3, percent: 15 }], privateReviewNote: "PRIVATE_BROWSER_SENTINEL" });
    const writer = db.bulkWriter();
    for (let index = 0; index < 128; index++) writer.set(db.collection("tournamentParticipants").doc(`${bracketId}_${index}`), { tournamentId: bracketId, status: "active", seed: index + 1, displayName: `Entrant ${index + 1}`, publicDisplayName: true });
    for (let round = 1; round <= 7; round++) for (let match = 1; match <= 128 / (2 ** round); match++) writer.set(db.collection("tournamentMatches").doc(`${bracketId}_${round}_${match}`), { tournamentId: bracketId, roundNumber: round, matchNumber: match, bracket: "winners", status: round === 1 ? "submissions_open" : "pending", participantAId: round === 1 ? `${bracketId}_${(match - 1) * 2}` : null, participantBId: round === 1 ? `${bracketId}_${(match - 1) * 2 + 1}` : null });
    writer.set(db.collection("tournamentMatches").doc(`${bracketId}_bronze`), { tournamentId: bracketId, roundNumber: 8, matchNumber: 1, bracket: "bronze", status: "pending", participantAId: null, participantBId: null });
    await writer.close();
    const completeBracketResponse = await anonymous.request.get(`${baseUrl}/api/tournaments/${bracketId}`);
    const completeBracket = await completeBracketResponse.json();
    check(completeBracketResponse.ok() && completeBracket.ok && completeBracket.data.participants.length === 128 && completeBracket.data.matches.length === 128, "public API returns every entrant and match in the 128-slot fixture");
    await publicPage.goto(`${baseUrl}/tournaments/${bracketId}`, { waitUntil: "domcontentloaded" });
    const tablist = publicPage.getByRole("tablist", { name: "Tournament information" });
    await tablist.waitFor({ state: "visible" });
    check(await tablist.getByRole("tab").allTextContents().then(labels => labels.join("|") === "Overview|Bracket|Matches|Participants|Prizes|Rules"), "Details exposes exactly the six required tabs");
    await tablist.getByRole("tab", { name: "Overview", exact: true }).focus();
    await publicPage.keyboard.press("ArrowRight");
    await publicPage.getByRole("button", { name: "Round View", exact: true }).waitFor();
    check(await publicPage.getByRole("button", { name: "Round View", exact: true }).getAttribute("aria-pressed") === "true", "keyboard tab navigation opens default Round View");
    await publicPage.getByRole("button", { name: "Full Bracket", exact: true }).click();
    const bracket = publicPage.getByRole("region", { name: /^Full Tournament bracket/ });
    await bracket.waitFor({ state: "visible" });
    check(await bracket.getByRole("link").count() === 128, "all 128 generated match cards are available without truncation");
    await publicPage.getByRole("button", { name: "Zoom bracket in", exact: true }).click();
    await expect(publicPage.getByText("125%", { exact: true })).toBeVisible();
    check(await publicPage.getByText("125%", { exact: true }).isVisible(), "Full Bracket has a working zoom control");
    check(!(await publicPage.content()).includes("PRIVATE_BROWSER_SENTINEL"), "private review fields are absent from public client payloads");
    await publicPage.screenshot({ path: join(artifacts, "tournament-bracket-desktop.png"), fullPage: true });
    await publicPage.setViewportSize({ width: 390, height: 844 });
    check(await bracket.evaluate(element => element.scrollWidth > element.clientWidth), "mobile Full Bracket supports horizontal exploration without compressing match cards");
    await publicPage.screenshot({ path: join(artifacts, "tournament-bracket-mobile.png"), fullPage: true });
    await anonymous.close(); await context.close();
  }, { requiresMedia: true });

  await test("Individual Tournament registration and physical Live Event registration persist from browser forms", async () => {
    const tournamentContext = await browser.newContext({ viewport: { width: 1280, height: 800 } });
    const tournamentPage = await login(tournamentContext, participant, { rememberMe: true });
    await tournamentPage.goto(`${baseUrl}/tournaments/${tournamentId}`, { waitUntil: "domcontentloaded" });
    const tournamentJoinLink = tournamentPage.getByRole("link", { name: "Join Tournament", exact: true });
    const tournamentJoinHref = await tournamentJoinLink.getAttribute("href");
    const tournamentJoinPath = `/tournaments/${tournamentId}/join`;
    const tournamentJoinNavigation = tournamentPage.waitForURL((url) => url.pathname === tournamentJoinPath, { timeout: navigationTimeout, waitUntil: "domcontentloaded" });
    await Promise.all([tournamentJoinNavigation, tournamentJoinLink.click()]).catch(async (error) => {
      throw new Error(`Tournament join navigation failed; href=${tournamentJoinHref}; finalUrl=${tournamentPage.url()}; ${error instanceof Error ? error.message : String(error)}`);
    });
    await tournamentPage.getByRole("heading", { name: "Join Tournament" }).waitFor({ timeout: 15000 }).catch(async () => {
      throw new Error(`Tournament join route has no heading; url=${tournamentPage.url()}; page=${(await tournamentPage.locator("body").innerText()).slice(0, 1400)}`);
    });
    await tournamentPage.getByLabel("I accept the Tournament rules and registration terms.").check();
    const tournamentJoinResponse = tournamentPage.waitForResponse((response) => {
      const url = new URL(response.url());
      return url.pathname === `/api/tournaments/${tournamentId}/join` && response.request().method() === "POST";
    }, { timeout: interactionTimeout });
    await tournamentPage.getByRole("button", { name: "Submit Tournament Registration" }).click();
    const registrationResponse = await tournamentJoinResponse;
    const registrationEnvelope = await registrationResponse.json().catch(() => null);
    check(registrationResponse.ok() && registrationEnvelope?.ok === true, `Tournament registration API should confirm the submitted form (HTTP ${registrationResponse.status()}, code=${String(registrationEnvelope?.code ?? "unknown")}).`);
    await tournamentPage.getByRole("status").waitFor({ timeout: 15000 });
    const tournamentParticipant = await db.collection("tournamentParticipants").doc(`${tournamentId}_${participant.uid}`).get();
    check(tournamentParticipant.exists && tournamentParticipant.data()?.status === "registered", "Tournament registration must create one confirmed participant record.");
    check((await db.collection("tournaments").doc(tournamentId).get()).data()?.participantCount === 1, "Tournament participant count must reflect confirmed registration.");

    const opponentParticipantId = `${tournamentId}_${sponsor.uid}`;
    const secondOpponentParticipantId = `${tournamentId}_${enterprise.uid}`;
    await Promise.all([
      db.collection("tournaments").doc(tournamentId).set({ status: "active", configVersion: 3, participantCount: 3, resultMethod: "votes", voting: { enabled: true, paidVotesActive: false }, updatedAt: new Date().toISOString() }, { merge: true }),
      db.collection("tournamentParticipants").doc(opponentParticipantId).set({ id: opponentParticipantId, tournamentId, userId: sponsor.uid, status: "registered", createdAt: new Date().toISOString() }),
      db.collection("tournamentParticipants").doc(secondOpponentParticipantId).set({ id: secondOpponentParticipantId, tournamentId, userId: enterprise.uid, status: "registered", createdAt: new Date().toISOString() }),
      db.collection("tournamentRounds").doc(tournamentRoundId).set({ id: tournamentRoundId, tournamentId, roundNumber: 1, status: "active", startsAt: new Date(Date.now() - 60000).toISOString(), endsAt: new Date(Date.now() + 3600000).toISOString() }),
      db.collection("tournamentMatches").doc(tournamentMatchId).set({ id: tournamentMatchId, tournamentId, roundId: tournamentRoundId, roundNumber: 1, matchNumber: 1, status: "voting_open", resultMethod: "votes", participantAId: opponentParticipantId, participantBId: secondOpponentParticipantId, voteCountA: 0, voteCountB: 0, voteSequence: 0, votingOpenedAt: new Date(Date.now() - 60000).toISOString(), votingClosesAt: new Date(Date.now() + 3600000).toISOString() }),
      db.collection("tournamentSubmissions").doc(`${tournamentId}_${tournamentMatchId}_${opponentParticipantId}`).set({ id: `${tournamentId}_${tournamentMatchId}_${opponentParticipantId}`, tournamentId, roundId: tournamentRoundId, matchId: tournamentMatchId, participantId: opponentParticipantId, status: "approved", mediaUrl: "https://example.test/entry-a.jpg", mediaType: "image" }),
      db.collection("tournamentSubmissions").doc(`${tournamentId}_${tournamentMatchId}_${secondOpponentParticipantId}`).set({ id: `${tournamentId}_${tournamentMatchId}_${secondOpponentParticipantId}`, tournamentId, roundId: tournamentRoundId, matchId: tournamentMatchId, participantId: secondOpponentParticipantId, status: "approved", mediaUrl: "https://example.test/entry-b.jpg", mediaType: "image" })
    ]);

    await tournamentPage.goto(`${baseUrl}/tournaments/${tournamentId}/matches/${tournamentMatchId}`, { waitUntil: "domcontentloaded" });
    await tournamentPage.getByRole("heading", { name: "Vote in this match" }).waitFor({ timeout: 15000 });
    check(await tournamentPage.getByRole("button", { name: "Free vote" }).count() === 2, "eligible entrant in an unrelated match sees one free-vote action for each approved submission");
    check(!(await tournamentPage.locator("body").innerText()).includes("Verified final votes:"), "live vote totals remain hidden in the Match Details UI");
    const tournamentVoteResponsePromise = tournamentPage.waitForResponse((response) => {
      const url = new URL(response.url());
      return url.pathname === `/api/tournaments/${tournamentId}/votes` && response.request().method() === "POST";
    }, { timeout: interactionTimeout });
    await tournamentPage.getByRole("button", { name: "Free vote" }).first().click();
    const tournamentVoteResponse = await tournamentVoteResponsePromise;
    const tournamentVoteEnvelope = await tournamentVoteResponse.json().catch(() => null);
    check(tournamentVoteResponse.ok() && tournamentVoteEnvelope?.ok === true, `Match Details free vote should reach the authorized handler (HTTP ${tournamentVoteResponse.status()}, code=${String(tournamentVoteEnvelope?.code ?? "unknown")}).`);
    const storedVotes = await db.collection("tournamentVotes").where("tournamentId", "==", tournamentId).where("matchId", "==", tournamentMatchId).where("voterId", "==", participant.uid).get();
    check(storedVotes.size === 1 && storedVotes.docs[0].data()?.status === "recorded", "free vote persists once through the actual Match Details API flow");
    const matchAfterVote = (await db.collection("tournamentMatches").doc(tournamentMatchId).get()).data();
    const selectedParticipantId = String(storedVotes.docs[0]?.data()?.participantId ?? "");
    check(Number(matchAfterVote?.voteCountA) === (selectedParticipantId === String(matchAfterVote?.participantAId) ? 1 : 0)
      && Number(matchAfterVote?.voteCountB) === (selectedParticipantId === String(matchAfterVote?.participantBId) ? 1 : 0), "verified server state increments the selected participant's authoritative match tally only");
    await tournamentContext.close();

    const eventContext = await browser.newContext({ viewport: { width: 390, height: 844 } });
    const eventPage = await login(eventContext, participant, { rememberMe: true });
    await eventPage.goto(`${baseUrl}/live-events`, { waitUntil: "domcontentloaded" });
    const eventRegisterPath = `/live-events/${liveEventId}/register`;
    await eventPage.getByRole("heading", { name: "In-Person Art Gathering", exact: true }).first().waitFor({ timeout: 15000 });
    const eventRegisterLink = eventPage.locator(`a[href="${eventRegisterPath}"]`);
    const eventRegisterHref = await eventRegisterLink.getAttribute("href");
    const eventRegisterNavigation = eventPage.waitForURL((url) => url.pathname === eventRegisterPath, { timeout: navigationTimeout, waitUntil: "domcontentloaded" });
    await Promise.all([eventRegisterNavigation, eventRegisterLink.click()]).catch(async () => {
      throw new Error(`Live Event register link did not navigate; href=${eventRegisterHref}; url=${eventPage.url()}; page=${(await eventPage.locator("body").innerText()).slice(0, 1200)}`);
    });
    await eventPage.getByRole("heading", { name: "Event Registration" }).waitFor({ timeout: 15000 });
    await eventPage.getByLabel("Phone Number").fill("+2348000000000");
    await eventPage.getByLabel("I accept the live event rules, risk notice, and recording consent.").check();
    await eventPage.getByRole("button", { name: "Submit Registration" }).click();
    await eventPage.getByRole("heading", { name: "Registration Confirmed" }).waitFor({ timeout: 15000 });
    const eventRegistration = await db.collection("liveEventRegistrations").doc(`${liveEventId}_${participant.uid}`).get();
    check(eventRegistration.exists && eventRegistration.data()?.status === "confirmed", "Physical event registration must persist a confirmed attendee record.");
    check((await db.collection("liveEvents").doc(liveEventId).get()).data()?.registrationCount === 1, "Physical event attendance count must reflect the registration.");
    check(await eventPage.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), "Live Event registration must not overflow on mobile.");
    await eventPage.screenshot({ path: join(artifacts, "live-event-registration-mobile.png"), fullPage: true });
    await eventContext.close();
  });

  await test("Tournament Match upload, replacement, Admin moderation, free and DoroCoin votes and verified result", async () => {
    const opponent = await seedUser("matchopponent", { role: "creator" });
    const voter = await seedUser("matchvoter", { role: "creator" });
    const id = `e2e_match_${runId}`, matchId = `${id}_final`, roundId = `${id}_round`;
    const a = `${id}_${participant.uid}`, b = `${id}_${opponent.uid}`;
    const { TOURNAMENT_PRODUCT_POLICY } = await import("../../lib/tournament-builder-policy.ts");
    await db.collection("tournaments").doc(id).set({ id, title: "Browser verified match", hostId: creator.uid, productPolicyVersion: TOURNAMENT_PRODUCT_POLICY, configVersion: 3, privacy: "public", status: "active", participationMode: "individual", resultMethod: "votes", submissionMediaTypes: ["image"], submissionDurationHours: 12, votingDurationHours: 12, format: "single_elimination", voting: { paidVotesActive: true } });
    await db.collection("tournamentRounds").doc(roundId).set({ tournamentId: id, status: "active", roundNumber: 1 });
    await db.collection("tournamentMatches").doc(matchId).set({ tournamentId: id, roundId, roundNumber: 1, matchNumber: 1, bracket: "winners", status: "submissions_open", resultMethod: "votes", participantAId: a, participantBId: b, submissionsOpenedAt: new Date(Date.now() - 1000).toISOString(), submissionDeadlineAt: new Date(Date.now() + 12 * 3600_000).toISOString(), voteCountA: 0, voteCountB: 0, voteSequence: 0, tiePrioritySlot: "A" });
    for (const [entryId, person] of [[a, participant], [b, opponent]]) await db.collection("tournamentParticipants").doc(entryId).set({ tournamentId: id, userId: person.uid, status: "active", lossCount: 0 });
    await db.collection("doroCoinWallets").doc(voter.uid).set({ balance: 10 });
    const { default: sharp } = await import("sharp");
    const contexts = [];
    async function upload(person, color, replacement = false) {
      const context = await browser.newContext({ viewport: { width: 1280, height: 800 } }); contexts.push(context);
      const page = await login(context, person, { rememberMe: true });
      await page.goto(`${baseUrl}/tournaments/${id}/matches/${matchId}`, { waitUntil: "domcontentloaded" });
      await page.getByRole("heading", { name: "Your fresh match submission", exact: true }).waitFor();
      await page.locator('input[type="file"]').first().setInputFiles({ name: `match-${color}.png`, mimeType: "image/png", buffer: await sharp({ create: { width: 24, height: 24, channels: 3, background: color } }).png().toBuffer() });
        await expect(page.getByRole("paragraph").filter({ hasText: "Upload complete." })).toBeVisible();
      const response = page.waitForResponse(response => new URL(response.url()).pathname === `/api/tournaments/${id}/submissions` && response.request().method() === "POST");
      await page.getByRole("button", { name: replacement ? "Submit replacement" : "Submit match entry", exact: true }).click();
      check((await response).ok(), "Match UI saves verified media through the actual authorized endpoint");
      return page;
    }
    await upload(participant, "red");
    await upload(participant, "purple", true);
    check((await db.collection("tournamentSubmissions").doc(`${id}_${matchId}_${a}`).get()).data()?.revision === 2, "Browser replacement preserves optimistic revision checks");
    await upload(opponent, "blue");
    const adminContext = await browser.newContext(); contexts.push(adminContext);
    const adminPage = await login(adminContext, admin, { rememberMe: true });
    await adminPage.goto(`${baseUrl}/admin/tournaments/${id}`, { waitUntil: "domcontentloaded" });
    for (let index = 0; index < 2; index++) {
        await adminPage.getByRole("textbox", { name: "Decision reason (required)", exact: true }).fill("Verified isolated browser submission media");
      await adminPage.getByLabel("I have reviewed the relevant evidence and confirm this decision.").check();
      const response = adminPage.waitForResponse(response => new URL(response.url()).pathname === `/api/admin/tournaments/${id}` && response.request().method() === "POST");
      await adminPage.getByRole("button", { name: "Approve submission", exact: true }).first().click();
      check((await response).ok(), "Admin moderation UI persists the authorized decision");
      await expect(adminPage.getByRole("button", { name: "Approve submission", exact: true })).toHaveCount(1 - index);
    }
    const worker = phase => execFileSync(process.execPath, ["--experimental-transform-types", "--experimental-loader", "./scripts/ts-alias-loader.mjs", "scripts/qa/tournament-browser-worker.mjs", id, phase], { cwd: repoRoot, env: process.env, stdio: "pipe", timeout: 120000 });
    await db.collection("tournamentMatches").doc(matchId).update({ submissionDeadlineAt: new Date(Date.now() - 1).toISOString() });
    worker("open");
    check((await db.collection("tournamentMatches").doc(matchId).get()).data()?.status === "voting_open", "Real lifecycle processing opens voting only after the fixture deadline and approvals");
    const voterContext = await browser.newContext({ viewport: { width: 390, height: 844 } }); contexts.push(voterContext);
    const page = await login(voterContext, voter, { rememberMe: true });
    await page.goto(`${baseUrl}/tournaments/${id}/matches/${matchId}`, { waitUntil: "domcontentloaded" });
    await page.getByRole("button", { name: "Vote", exact: true }).first().waitFor();
    check(await page.getByLabel("Verified final vote tally").count() === 0, "Live totals remain hidden before verification");
    for (let index = 0; index < 2; index++) {
      if (index) page.once("dialog", dialog => dialog.accept());
      const response = page.waitForResponse(response => new URL(response.url()).pathname === `/api/tournaments/${id}/votes` && response.request().method() === "POST");
      await page.getByRole("button", { name: "Vote", exact: true }).first().click();
      check((await response).ok(), index ? "Confirmed additional browser vote uses DoroCoins" : "First browser vote is free");
    }
    check((await db.collection("doroCoinWallets").doc(voter.uid).get()).data()?.balance === 5, "Exactly five DoroCoins are debited once");
    await db.collection("tournamentMatches").doc(matchId).update({ votingClosesAt: new Date(Date.now() - 1).toISOString() });
    worker("result");
    await page.reload({ waitUntil: "domcontentloaded" });
    await page.getByLabel("Verified final vote tally").waitFor();
    check((await db.collection("tournamentMatches").doc(matchId).get()).data()?.status === "confirmed", "Leased worker verifies the browser votes and final result");
    check(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), "Verified Match Details remains usable on mobile");
    await page.screenshot({ path: join(artifacts, "tournament-match-verified-mobile.png"), fullPage: true });
    for (const context of contexts) await context.close();
  }, { requiresMedia: true });

  await test("Admin, wallet, challenge builders, Tournament, and Live Event journeys render without client exceptions", async () => {
    const context = await browser.newContext({ viewport: { width: 1365, height: 900 } });
    const page = await login(context, admin, { rememberMe: true });
    const paths = ["/admin", "/wallet", "/challenges/create", "/private/create", "/tournaments", "/tournaments/create", "/live-events", "/live-events/host/apply"];
    for (const path of paths) {
      const response = await page.goto(`${baseUrl}${path}`, { waitUntil: "domcontentloaded" });
      check(Boolean(response && response.status() < 500), `${path} should not return a server error (got ${response?.status() ?? "no response"}).`);
      await page.locator("body").waitFor();
      check((await page.locator("body").innerText()).trim().length > 0, `${path} should render non-empty page content.`);
    }
    await page.screenshot({ path: join(artifacts, "admin-mobile.png"), fullPage: true });
    await context.close();
  });

  await test("Tournament runtime verification Admin controls create, inspect and clean only an isolated synthetic run", async () => {
    const context = await browser.newContext(), page = await login(context, admin, { rememberMe: true });
    await page.goto(baseUrl + "/admin/tournament-runtime-verification");
    await expect(page.getByRole("heading", { name: "Isolated Tournament runtime verification", exact: true })).toBeVisible();
    check(await page.getByRole("button", { name: "Create synthetic run", exact: true }).isDisabled(), "reason required before synthetic operation");
    await page.getByLabel("Verification reason", { exact: true }).fill("Isolated emulator Admin runtime verification");
    const created = page.waitForResponse(r => new URL(r.url()).pathname === "/api/admin/tournament-runtime-verification" && r.request().method() === "POST");
    await page.getByRole("button", { name: "Create synthetic run", exact: true }).click();
    const response = await created, envelope = await response.json();
    check(response.ok() && /^release-probe_[a-f0-9-]+$/.test(envelope.data?.id), "actual authenticated Admin UI creates only reserved synthetic ID");
    const ref = db.collection("tournamentRuntimeVerification").doc(envelope.data.id);
    try {
      check((await ref.get()).data()?.synthetic === true, "created exact synthetic document");
      const status = page.waitForResponse(r => new URL(r.url()).pathname === "/api/admin/tournament-runtime-verification" && r.request().method() === "POST");
      await page.getByRole("button", { name: "Refresh test status", exact: true }).click();
      check((await status).ok(), "authenticated status request succeeds");
      await expect(page.getByLabel("Synthetic verification result")).toContainText('"transitions": 0');
      const cleanup = page.waitForResponse(r => new URL(r.url()).pathname === "/api/admin/tournament-runtime-verification" && r.request().method() === "POST");
      await page.getByRole("button", { name: "Delete synthetic run", exact: true }).click();
      check((await cleanup).ok(), "actual UI cleanup succeeds");
      check(!(await ref.get()).exists, "synthetic document absent after cleanup");
      check(await page.getByRole("button", { name: "Dispatch test task", exact: true }).isDisabled(), "no dispatch without selected run");
    } finally { if ((await ref.get()).exists) await ref.delete(); await context.close(); }
  });

  await test("Customer Support ticket creation, Admin primary confirmation and reply persist through browser controls", async () => {
    const context = await browser.newContext({ viewport: { width: 1365, height: 900 } });
    const page = await login(context, creator);
    const subject = `Support browser ${runId}`;
    await page.goto(`${baseUrl}/support/new`, { waitUntil: "domcontentloaded" });
    await page.getByLabel("Subject", { exact: true }).fill(subject);
    check(await page.getByLabel(/^Attachments/).isDisabled(), "Support attachment upload controls remain disabled pending configuration");
    await page.getByLabel(/^Description/).fill("Please explain the local test account access settings.");
    await page.getByLabel(/^Contact email/).fill(`alternate-${runId}@example.test`);
    const creationResponse = page.waitForResponse((response) => new URL(response.url()).pathname === "/api/support/tickets" && response.request().method() === "POST");
    await page.getByRole("button", { name: "Submit request", exact: true }).click();
    const createdResponse = await creationResponse;
    const created = await createdResponse.json();
    check(createdResponse.status() === 200 && created.ok === true, "Support browser submission returns a successful application envelope");
    const ticketId = created.data.ticketId;
    await page.waitForURL(`${baseUrl}/support/tickets/${ticketId}`);
    await page.getByRole("heading", { level: 1, name: subject, exact: true }).waitFor();
    check(await page.getByLabel(/Add files/).isDisabled(), "Ticket reply uploads remain disabled pending configuration");
    const ticketRef = db.collection("supportTickets").doc(ticketId);
    const ticket = (await ticketRef.get()).data();
    check(ticket?.userId === creator.uid, "Browser-created ticket remains owned by the authenticated customer");
    check(ticket?.contactEmail === `alternate-${runId}@example.test`, "Alternative contact address is persisted without changing ownership");
    check(ticket?.primaryIssueId === null, "New ticket awaits Admin primary-issue confirmation");
    const adminContext = await browser.newContext({ viewport: { width: 1365, height: 900 } });
    const adminPage = await login(adminContext, admin);
    await adminPage.goto(`${baseUrl}/admin/safety-support/support-tickets`, { waitUntil: "domcontentloaded" });
    await adminPage.getByRole("button", { name: new RegExp(subject) }).click();
    await adminPage.getByRole("heading", { level: 2, name: subject, exact: true }).waitFor();
    check(await adminPage.getByRole("button", { name: "Confirm as primary issue", exact: true }).isDisabled(), "Admin confirmation cannot run without confirmation and a reason");
    await adminPage.getByLabel("Required Admin reason", { exact: true }).fill("Verified the original account access complaint.");
    await adminPage.getByRole("checkbox").check();
    const primaryResponse = adminPage.waitForResponse((response) => new URL(response.url()).pathname.endsWith(`/${ticketId}/primary`) && response.request().method() === "POST");
    await adminPage.getByRole("button", { name: "Confirm as primary issue", exact: true }).click();
    check((await primaryResponse).status() === 200, "Admin browser primary confirmation succeeds");
    await adminPage.getByText("Admin-confirmed primary", { exact: false }).waitFor();
    check(Boolean((await ticketRef.get()).data()?.primaryIssueId), "Admin browser action persists the primary issue");
    await adminPage.getByLabel("Required Admin reason", { exact: true }).fill("Provide the verified account access explanation.");
    await adminPage.getByRole("checkbox").check();
    const reply = "Your local test account access is active; this reply changes no financial records.";
    await adminPage.getByLabel("Reply", { exact: true }).fill(reply);
    const replyResponse = adminPage.waitForResponse((response) => new URL(response.url()).pathname.endsWith(`/${ticketId}/messages`) && response.request().method() === "POST");
    await adminPage.getByRole("button", { name: "Save reply and queue email", exact: true }).click();
    const replied = await replyResponse;
    check(replied.status() === 200, "Admin browser reply is stored successfully");
    const replyRecords = await ticketRef.collection("messages").where("body", "==", reply).get();
    check(replyRecords.size === 1, "Exactly one authoritative ticket reply is persisted");
    const outboxes = await db.collection("supportEmailOutbox").where("ticketId", "==", ticketId).get();
    check(outboxes.docs.every((record) => record.data().status !== "sent"), "Unconfigured outbound email is never reported as sent");
    await page.reload({ waitUntil: "domcontentloaded" });
    await page.getByText(reply, { exact: true }).waitFor();
    check((await db.collection("cashLedger").where("sourceId", "==", ticketId).get()).empty, "Support browser actions create no cash ledger mutations");
    await page.screenshot({ path: join(artifacts, "support-customer-ticket.png"), fullPage: true });
    await adminPage.screenshot({ path: join(artifacts, "support-admin-ticket.png"), fullPage: true });
    await adminContext.close();
    await context.close();
  });

  await test("Public and participant journeys remain usable at mobile viewport", async () => {
    const context = await browser.newContext({ viewport: { width: 375, height: 812 } });
    const page = await context.newPage();
    page.on("pageerror", (error) => pageErrors.push(`${new URL(page.url()).pathname}: ${error.message}`));
    for (const path of ["/", "/explore", "/live-events", "/tournaments"]) {
      const response = await page.goto(`${baseUrl}${path}`, { waitUntil: "domcontentloaded" });
      check(Boolean(response && response.status() < 500), `${path} should load on mobile without a server error.`);
      check(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), `${path} should not have horizontal page overflow at 375px.`);
    }
    await context.close();
  });

  await test("Live Event Attendance Only creator earnings approval, clearance and owner visibility", async () => {
    const owner=await seedUser("liveearningsowner",{role:"creator"}),id=`creator_earnings_browser_${runId}`,bookingId=`${id}_booking`,sourceId=`live_event_${bookingId}_admission_creator`;
    const ended=new Date(Date.now()-3600000).toISOString(),event={id,title:`Creator earnings ${runId}`,creatorId:owner.uid,isLiveEvent:true,eventApprovalStatus:"approved",visibility:"public",status:"completed",startsAt:past,endsAt:ended,completedAt:ended,capacity:20,hostOperations:{schemaVersion:2,eventFormat:"attendance_only",timezone:"UTC",competitorCapacity:0}};
    await Promise.all([db.collection("challenges").doc(id).set(event),db.collection("liveEvents").doc(id).set(event),db.collection("liveEventBookings").doc(bookingId).set({eventId:id,userId:"seeded_buyer",status:"confirmed",paymentConfirmed:true,providerPaymentIntentId:`pi_${bookingId}`,amountCents:10000,admissionCents:10000,competitionEntryCents:0,currency:"usd",refundReservedCents:0}),db.collection("cashLedger").doc(sourceId).set({id:sourceId,eventId:id,challengeId:id,userId:owner.uid,sourceId:bookingId,sourceType:"host_event_revenue",direction:"credit",revenueType:"admission",shareType:"creator_host_share",amountCents:8500,netAmountCents:8500,currency:"USD",providerReference:`pi_${bookingId}`,status:"held",settlementRestricted:true,createdAt:now})]);
    await db.collection("cashLedger").doc(`live_event_${bookingId}_admission_platform`).set({eventId:id,challengeId:id,userId:"platform",sourceId:bookingId,sourceType:"host_event_revenue",direction:"credit",revenueType:"admission",shareType:"platform_share",amountCents:1500,netAmountCents:1500,currency:"USD",status:"held",providerReference:`pi_${bookingId}`,createdAt:now});
    const context=await browser.newContext(),page=await login(context,admin,{rememberMe:true});
    await page.goto(`${baseUrl}/admin/finance`,{waitUntil:"domcontentloaded"});
    await page.getByRole("heading",{name:"Live Event original-payment returns",exact:true}).waitFor();
    check(await page.getByText("Live Event provider return execution is disabled or unavailable. The original payment and its review case remain preserved.",{exact:true}).isVisible(),"Admin original-payment return UI accurately preserves the disabled provider boundary");
    const card=page.getByRole("heading",{name:"Live Event creator earnings approval",exact:true}).locator("..");
    await card.getByLabel("Creator earnings event ID",{exact:true}).fill(id);
    await card.getByRole("button",{name:"Review original creator earnings",exact:true}).click();
    await card.getByText("Admission earnings: $85.00",{exact:true}).waitFor();
    check(await card.getByText("Awaiting Admin approval",{exact:true}).isVisible(),"Attendance Only earnings can be reviewed without winner records");
    async function confirmDecision(){await card.getByLabel("Creator earnings decision reason",{exact:true}).fill("Verified completion, original booking shares and all outstanding financial obligations");await card.getByRole("checkbox",{name:"I verified completion, original payment sources, refunds, disputes and the requested creator earnings decision.",exact:true}).check();}
    await confirmDecision();
    const approved=page.waitForResponse(response=>new URL(response.url()).pathname==="/api/admin/live-event-creator-earnings"&&response.request().method()==="POST");
    await card.getByRole("button",{name:"Approve eligible creator earnings for clearance",exact:true}).click();
    check((await approved).ok(),"existing single Admin approves original earnings through the actual financial endpoint");
    await card.getByText("Original creator earnings approved for 72-hour clearance. They are not available yet.",{exact:true}).waitFor();
    const source=(await db.collection("cashLedger").doc(sourceId).get()).data();
    check(Date.parse(source.holdUntil)-Date.parse(source.creatorEarningsApprovedAt)===72*3600000,"the existing clearance begins at this approval");
    check((await db.collection("cashWallets").doc(owner.uid).get()).data().lockedBalanceCents===8500,"approved earnings remain locked, rather than immediately withdrawable");
    check((await db.collection("cashLedger").where("eventId","==",id).get()).size===2,"approval preserves the two original creator/platform records without a duplicate revenue allocation");
    await card.getByRole("button",{name:"Review original creator earnings",exact:true}).click();
    await card.getByText("Clearing after Admin approval",{exact:true}).waitFor();await confirmDecision();
    const early=page.waitForResponse(response=>new URL(response.url()).pathname==="/api/admin/live-event-creator-earnings"&&response.request().method()==="POST");
    await card.getByRole("button",{name:"Recheck creator earnings clearance",exact:true}).click();
    check((await early).status()===409,"actual financial handler refuses early clearance");
    // Deterministic local fixture aging, not a claim that real provider funds cleared.
    await db.collection("cashLedger").doc(sourceId).update({creatorEarningsApprovedAt:new Date(Date.now()-73*3600000).toISOString(),holdUntil:new Date(Date.now()-3600000).toISOString()});
    await card.getByRole("button",{name:"Review original creator earnings",exact:true}).click();
    await card.getByText("Clearing after Admin approval",{exact:true}).waitFor();await confirmDecision();
    const cleared=page.waitForResponse(response=>new URL(response.url()).pathname==="/api/admin/live-event-creator-earnings"&&response.request().method()==="POST");
    await card.getByRole("button",{name:"Recheck creator earnings clearance",exact:true}).click();
    check((await cleared).ok(),"reconciled aged fixture clears through the actual authorization path");
    check((await db.collection("cashWallets").doc(owner.uid).get()).data().availableBalanceCents===8500,"original creator earnings become internally available exactly once");
    const ownerContext=await browser.newContext(),ownerPage=await login(ownerContext,owner,{rememberMe:true});
    await ownerPage.goto(`${baseUrl}/live-events/${id}/manage`,{waitUntil:"domcontentloaded"});await ownerPage.getByRole("button",{name:"Tickets & Earnings",exact:true}).click();
    await ownerPage.getByText("Available internally, subject to withdrawal checks",{exact:true}).waitFor();
    check(await ownerPage.getByText("Available internally, subject to withdrawal checks",{exact:true}).locator("..").getByText("$85.00",{exact:true}).isVisible(),"creator dashboard reports only the cleared original amount");
    check(await ownerPage.getByText("External withdrawals are not available until an approved payout provider is connected and verified.",{exact:true}).isVisible(),"internal clearance never claims a live payout integration is available");
    await ownerPage.screenshot({path:join(artifacts,"live-event-creator-earnings-clearance.png"),fullPage:true});
    await ownerContext.close();await context.close();
  });

  await test("Live Event physical competition registration, arrival, judging and public results", async () => {
    const id=`physical_journey_${runId}`,first=await seedUser("livewinner"),second=await seedUser("liveopponent");
    // Model a public identity without a contact field; real Auth remains on the demo emulator.
    await db.collection("profiles").doc(first.uid).update({email:"",publicProfile:true});
    const start=new Date(Date.now()-60000).toISOString(),end=new Date(Date.now()+7200000).toISOString();
    const record={id,title:`Physical judging ${runId}`,creatorId:creator.uid,isLiveEvent:true,eventApprovalStatus:"approved",visibility:"public",status:"in_progress",description:"Physical competition journey using verified local accounts and real event operations.",startsAt:start,endsAt:end,venueName:"Local test venue",capacity:4,hostOperations:{schemaVersion:2,eventFormat:"physical_competition",timezone:"UTC",competitorCapacity:2,winnerCount:1,physicalJudgeCount:2,ticketPrice:0,competitionEntryFee:0,registrationOpensAt:past,registrationClosesAt:end,checkInStartAt:start,checkInEndAt:end,eventRules:["Respect the physical judges."],competitionInstructions:["Present your own Participant Pass."]}};
    await Promise.all([db.collection("challenges").doc(id).set(record),db.collection("liveEvents").doc(id).set(record)]);
    const registrations=[];
    for(const [user,name] of [[first,"First competitor"],[second,"Second competitor"]]){
      const context=await browser.newContext(),page=await login(context,user,{rememberMe:true});
      await page.goto(`${baseUrl}/live-events/${id}`,{waitUntil:"domcontentloaded"});
      let admission;
      if(user.uid===first.uid){
        await page.getByLabel("Guest 1 name",{exact:true}).fill("My personal audience ticket");
        const booked=page.waitForResponse(response=>new URL(response.url()).pathname===`/api/live-events/${id}/bookings`&&response.request().method()==="POST");await page.getByRole("button",{name:"Get tickets",exact:true}).click();check((await booked).ok(),"signed-in purchaser first obtains their own audience ticket");
        await page.getByRole("heading",{name:"My Tickets",exact:true}).waitFor();
        admission=(await db.collection("liveEventTickets").where("eventId","==",id).where("userId","==",user.uid).get()).docs[0].data();
        await page.getByLabel("Choose your competition admission",{exact:true}).selectOption(admission.id);
        await page.getByRole("checkbox",{name:"This ticket is for my personal admission. After successful conversion its old QR code will stop working, including for anyone I previously shared it with.",exact:true}).check();
      }
      await page.getByLabel("Competitor name",{exact:true}).fill(name);
      const registered=page.waitForResponse(response=>new URL(response.url()).pathname===`/api/live-events/${id}/bookings`&&response.request().method()==="POST");
      await page.getByRole("button",{name:admission?"Convert ticket and join":"Join competition",exact:true}).click();
      check((await registered).ok(),"competitor registers through the actual authenticated booking endpoint");
      await page.getByText("Participant Pass — only valid for the registered competitor",{exact:true}).waitFor();
      const row=(await db.collection("liveEventRegistrations").doc(`${id}_${user.uid}`).get()).data();
      check(row.eligible&&row.status==="confirmed","registration persists eligibility without fabricating attendance");
      if(admission){check((await db.collection("liveEventTickets").doc(admission.id).get()).data().status==="converted","free upgrade permanently converts only the explicitly selected owned ticket");check((await page.request.post(`${baseUrl}/api/live-events/${id}/presentation`,{headers:{origin:baseUrl},data:{ticketId:admission.id,credential:admission.credential}})).status()===404,"a previously shared original QR cannot retrieve a valid ticket after conversion");}
      registrations.push({user,name,ticketId:row.ticketId});await context.close();
    }
    const ownerContext=await browser.newContext(),page=await login(ownerContext,creator,{rememberMe:true});
    await page.goto(`${baseUrl}/live-events/${id}/manage`,{waitUntil:"domcontentloaded"});
    await page.getByRole("button",{name:"Check-In",exact:true}).click();
    for(const person of registrations){
      await page.getByLabel("Ticket identification",{exact:true}).fill(person.ticketId);
      await page.getByRole("button",{name:"Verify ticket",exact:true}).click();
      await page.getByRole("button",{name:"Confirm Arrival",exact:true}).waitFor();page.once("dialog",dialog=>dialog.accept());
      const arrived=page.waitForResponse(response=>new URL(response.url()).pathname===`/api/live-events/${id}/check-in`&&response.request().postDataJSON()?.confirm===true);
      await page.getByRole("button",{name:"Confirm Arrival",exact:true}).click();
      check((await arrived).ok(),"organizer confirms physical identity and arrival through the real check-in endpoint");
      await page.getByRole("button",{name:"Confirm Arrival",exact:true}).waitFor({state:"hidden"});
    }
    await page.getByRole("button",{name:"Results",exact:true}).click();
    async function score(name,value){await page.getByLabel("Reason for this results action",{exact:true}).fill("The physical judges verified these scores at the venue");await page.getByLabel(`Physical judge scores for ${name}`,{exact:true}).fill(value);const saved=page.waitForResponse(response=>new URL(response.url()).pathname===`/api/live-events/${id}/management`&&response.request().postDataJSON()?.action==="scores");await page.getByRole("heading",{name,exact:true}).locator("..").getByRole("button",{name:"Save confirmed scores",exact:true}).click();check((await saved).ok(),"all physical judges' scores are persisted through the actual authorized handler");await expect(page.getByLabel("Reason for this results action",{exact:true})).toHaveValue("");}
    for(const person of registrations)await score(person.name,"8, 8");
    async function announce(){await page.getByLabel("Reason for this results action",{exact:true}).fill("Reviewed the final physical judging evidence and confirmed the results");page.once("dialog",dialog=>dialog.accept());const response=page.waitForResponse(response=>new URL(response.url()).pathname===`/api/live-events/${id}/management`&&response.request().postDataJSON()?.action==="announce");await page.getByRole("button",{name:"Review and Announce Results",exact:true}).click();return response;}
    check((await announce()).status()===409,"unresolved tied winning positions cannot be announced");
    check(!(await db.collection("liveEvents").doc(id).get()).data().resultsPublishedAt,"a tie hold creates no fictitious official winner");
    await score(registrations[0].name,"9, 9");
    check((await announce()).ok(),"verified physical reassessment allows the calculated winner to be announced");
    const official=(await db.collection("liveEvents").doc(id).get()).data();
    check(official.publishedPhysicalResults[0].userId===first.uid,"the highest verified score determines the winner");
    check((await db.collection("cashLedger").where("eventId","==",id).get()).empty,"sporting publication does not create wallet credits or payouts");
    check((await db.collection("notifications").doc(`live_result_${id}_${first.uid}`).get()).exists,"the official winner receives an in-app notification");
    const publicContext=await browser.newContext(),publicPage=await publicContext.newPage();
    await publicPage.goto(`${baseUrl}/live-events/${id}`,{waitUntil:"domcontentloaded"});
    await publicPage.getByRole("tab",{name:"Results",exact:true}).click();
    check(await publicPage.getByText("Place 1 · Journey livewinner",{exact:true}).isVisible(),"signed-out results show the winner's public profile name and official position");
    check(await publicPage.getByText("Judges’ score: 18",{exact:true}).isVisible(),"the public sporting score combines the persisted physical judges' scores");
    await publicPage.screenshot({path:join(artifacts,"live-event-physical-results.png"),fullPage:true});
    await publicContext.close();await ownerContext.close();
  });

  await test("Live Event grouped venue and check-in reschedule requires actual Admin approval", async () => {
    const id=`reviewed_live_${runId}`,oldStart=new Date(Date.now()+86400000).toISOString(),oldEnd=new Date(Date.now()+86400000+4*3600000).toISOString(),closing=new Date(Date.now()+7200000).toISOString();
    const record={id,title:`Reviewed reschedule ${runId}`,creatorId:creator.uid,isLiveEvent:true,eventApprovalStatus:"approved",visibility:"public",status:"scheduled",startsAt:oldStart,endsAt:oldEnd,venueName:"Original venue",eventAddress:"Original address",eventCity:"Test city",eventCountry:"Nigeria",capacity:20,sponsorFundingCutoffAt:oldStart,hostOperations:{schemaVersion:2,eventFormat:"attendance_only",timezone:"UTC",registrationOpensAt:past,registrationClosesAt:closing,checkInStartAt:new Date(Date.parse(oldStart)-3600000).toISOString(),checkInEndAt:oldEnd,competitorCapacity:0}};
    await Promise.all([db.collection("challenges").doc(id).set(record),db.collection("liveEvents").doc(id).set(record)]);
    const ownerContext=await browser.newContext({timezoneId:"UTC"}),ownerPage=await login(ownerContext,creator,{rememberMe:true});
    await ownerPage.goto(`${baseUrl}/live-events/${id}/manage`,{waitUntil:"domcontentloaded"});
    await ownerPage.getByRole("button",{name:"Event Details",exact:true}).click();
    const start=new Date(Math.floor((Date.now()+2*86400000)/60000)*60000),end=new Date(start.getTime()+3*3600000),arrival=new Date(start.getTime()-3600000);
    await ownerPage.getByLabel("Venue name",{exact:true}).fill("Reviewed replacement venue");
    for(const [label,date] of [["Event start",start],["Event end",end],["Check-in opens",arrival],["Check-in closes",end]])await ownerPage.getByLabel(label,{exact:true}).fill(date.toISOString().slice(0,16));
    await ownerPage.getByLabel("Required reason",{exact:true}).fill("The venue approved this replacement date and arrival window");
    ownerPage.once("dialog",dialog=>dialog.accept());
    const proposed=ownerPage.waitForResponse(response=>new URL(response.url()).pathname===`/api/live-events/${id}/changes`&&response.request().method()==="POST");
    await ownerPage.getByRole("button",{name:"Request Admin review",exact:true}).click();
    check((await proposed).ok(),"organizer submits all related venue and arrival changes through the real endpoint");
    check((await db.collection("challenges").doc(id).get()).data().startsAt===oldStart,"a proposal cannot change published details before Admin approval");
    const request=(await db.collection("liveEventChangeRequests").where("eventId","==",id).get()).docs[0];
    check(request.data().proposed.checkInStartAt===arrival.toISOString(),"the request preserves explicit check-in timing for review");
    const adminContext=await browser.newContext({timezoneId:"UTC"}),adminPage=await login(adminContext,admin,{rememberMe:true});
    await adminPage.goto(`${baseUrl}/admin`,{waitUntil:"domcontentloaded"});
    const review=adminPage.getByRole("heading",{name:"Published Live Event changes",exact:true}).locator("..");
    await review.getByLabel("Decision reason",{exact:true}).fill("Verified the venue, schedule and existing booking protections");
    await review.getByRole("checkbox",{name:"I reviewed the existing and proposed values and confirm this decision.",exact:true}).check();
    const decided=adminPage.waitForResponse(response=>new URL(response.url()).pathname==="/api/admin/live-event-changes"&&response.request().method()==="POST");
    await review.getByRole("heading",{name:id,exact:true}).locator("..").getByRole("button",{name:"Approve",exact:true}).click();
    check((await decided).ok(),"the existing single-Admin review controls apply the authorized grouped request");
    const changed=(await db.collection("challenges").doc(id).get()).data();
    check(changed.startsAt===start.toISOString()&&changed.hostOperations.checkInStartAt===arrival.toISOString(),"event and check-in changes commit together");
    check(changed.hostOperations.registrationClosesAt===closing,"rescheduling does not extend registration eligibility or old booking deadlines");
    check((await db.collection("liveEventUpdates").doc(request.id).get()).exists,"approved material changes retain a durable registrant notice and refund-rights record");
    await ownerPage.reload({waitUntil:"domcontentloaded"});
    await ownerPage.getByRole("button",{name:"Event Details",exact:true}).click();
    await ownerPage.getByText("Current published venue and schedule",{exact:true}).click();
    check(await ownerPage.getByText(start.toISOString(),{exact:true}).isVisible(),"the organizer sees current server-persisted schedule values");
    await ownerPage.screenshot({path:join(artifacts,"live-event-reviewed-reschedule.png"),fullPage:true});
    const rosterBatch=db.batch();
    for(let index=0;index<205;index++){const suffix=String(index).padStart(4,"0");rosterBatch.set(db.collection("liveEventTickets").doc(`${id}_${suffix}`),{eventId:id,guestName:`Roster guest ${suffix}`,kind:"audience",status:"confirmed",checkedInAt:null});}
    await rosterBatch.commit();
    await ownerPage.reload({waitUntil:"domcontentloaded"});
    await ownerPage.getByRole("button",{name:"Guests & Competitors",exact:true}).click();
    check(await ownerPage.getByText("Roster guest 0000",{exact:true}).isVisible(),"management renders the first authorized roster page");
    check(await ownerPage.getByText("Roster guest 0204",{exact:true}).count()===0,"later guests are not falsely included before their page loads");
    for(let index=0;index<2;index++){const loaded=ownerPage.waitForResponse(response=>new URL(response.url()).pathname===`/api/live-events/${id}/management`&&new URL(response.url()).searchParams.has("ticketsAfter"));await ownerPage.getByRole("button",{name:"Load more guests and competitors",exact:true}).click();check((await loaded).ok(),"load-more uses the real authorized management endpoint");}
    await ownerPage.getByText("Roster guest 0204",{exact:true}).waitFor();
    check(await ownerPage.getByRole("button",{name:"Load more guests and competitors",exact:true}).count()===0,"pagination ends when the server has no further roster records");
    await ownerPage.getByLabel("Find a guest or competitor",{exact:true}).fill("0204");
    check(await ownerPage.getByText("Roster guest 0204",{exact:true}).isVisible(),"roster search includes guests loaded from later pages");
    check(await ownerPage.getByText("Roster guest 0000",{exact:true}).count()===0,"local roster search filters loaded pages consistently");
    await ownerPage.screenshot({path:join(artifacts,"live-event-paginated-roster.png"),fullPage:true});
    await ownerContext.close();await adminContext.close();
  });

  await test("Live Event financial Admin evidence, approval and held-credit safeguards", async () => {
    const id=`financial_live_${runId}`,winner=await seedUser("livefinancialwinner");
    const event={id,title:`Financial review ${runId}`,creatorId:creator.uid,isLiveEvent:true,eventApprovalStatus:"approved",visibility:"public",status:"completed",startsAt:past,endsAt:now,resultsPublishedAt:now,physicalResultsVersion:2,physicalJudgeCountLocked:1,publishedPhysicalResults:[{userId:winner.uid,placement:1,score:900}],eventPrizeSettlementStatus:"awaiting_financial_verification",hostOperations:{schemaVersion:2,eventFormat:"physical_competition",winnerCount:1,physicalJudgeCount:1}};
    await Promise.all([
      db.collection("challenges").doc(id).set(event),db.collection("liveEvents").doc(id).set(event),
      db.collection("liveEventRegistrations").doc(`${id}_winner`).set({eventId:id,userId:winner.uid,kind:"competitor",eligible:true,status:"checked_in",checkedInAt:past}),
      db.collection("liveEventPhysicalScores").doc(`${id}_score`).set({eventId:id,userId:winner.uid,scores:[9],attendanceCheckedInAt:past}),
      db.collection("creatorPrizeFundingPayments").doc(`${id}_fixture`).set({challengeId:id,status:"confirmed",webhookConfirmed:true,paymentPurpose:"prize_pool_funding",currency:"USD",amountCents:1000}),
    ]);
    const context=await browser.newContext({viewport:{width:1365,height:900}}),page=await login(context,admin,{rememberMe:true});
    await page.goto(`${baseUrl}/admin/finance`,{waitUntil:"domcontentloaded"});
    await page.getByRole("heading",{name:"Live Event prize approval",exact:true}).waitFor();
    await page.getByLabel("Event ID",{exact:true}).fill(id);
    const preview=page.waitForResponse(response=>new URL(response.url()).pathname==="/api/admin/live-event-settlements"&&new URL(response.url()).searchParams.get("eventId")===id);
    await page.getByRole("button",{name:"Review authoritative evidence",exact:true}).click();
    check((await preview).ok(),"Admin browser retrieves authoritative financial and judging evidence");
    await page.getByText("Confirmed winner pool: $10.00",{exact:true}).waitFor();
    check((await db.collection("cashLedger").where("eventId","==",id).get()).empty,"Financial preview does not create money");
    const approve=page.getByRole("button",{name:"Approve held winner credits",exact:true});
    check(await approve.isDisabled(),"Approval is disabled before reason and confirmation");
    await page.getByLabel("Approval reason",{exact:true}).fill("Verified original funding and published physical judges' records");
    await page.getByRole("checkbox",{name:/I verified the official results/}).check();
    const decision=page.waitForResponse(response=>new URL(response.url()).pathname==="/api/admin/live-event-settlements"&&response.request().method()==="POST");
    await approve.click();check((await decision).ok(),"Admin approval connects to the actual authorized endpoint");
    await page.getByText(/Approved\. Winner credits are held pending clearance/).waitFor();
    const credits=await db.collection("cashLedger").where("eventId","==",id).get();
    check(credits.size===1&&credits.docs[0].data().status==="pending_hold","Exactly one held winner credit exists");
    check((await db.collection("cashWallets").doc(winner.uid).get()).data()?.lockedBalanceCents===1000,"Real internal wallet balance is locked, not spendable");
    check(credits.docs[0].data().externalPayoutExecuted===false,"Financial approval never executes an external payout");
    await page.getByText("Clear previously approved winner credits",{exact:true}).click();
    await page.getByLabel("Clearance reason",{exact:true}).fill("Recheck the approved allocation and clearance period");
    await page.getByRole("checkbox",{name:"I confirm the clearance review for the event ID above.",exact:true}).check();
    const clearance=page.waitForResponse(response=>new URL(response.url()).pathname==="/api/admin/live-event-settlements"&&response.request().method()==="PATCH");
    await page.getByRole("button",{name:"Recheck and clear eligible credits",exact:true}).click();
    check((await clearance).status()===409,"Browser cannot bypass the 72-hour clearance period");
    await page.getByText(/The clearance period or financial reconciliation is incomplete/).waitFor();
    await page.screenshot({path:join(artifacts,"live-event-admin-financial-review.png"),fullPage:true});
    await context.close();
  });

  for(const builderFormat of ["attendance_only","physical_competition"]){
  await test(`Live Event V2 ${builderFormat} builder draft, media and automatic publication`, async () => {
    const owner=await seedUser(`live-builder-owner-${builderFormat}`,{role:"host"});
    await Promise.all([db.collection("users").doc(owner.uid).update({planId:"verified_host",planStatus:"active",creatorOnboardingComplete:true,hostOnboardingComplete:true}),db.collection("profiles").doc(owner.uid).update({planId:"verified_host",planStatus:"active",creatorOnboardingComplete:true,hostOnboardingComplete:true})]);
    const context=await browser.newContext({viewport:{width:1440,height:1000}});
    const page=await login(context,owner,{rememberMe:true});
    await page.goto(`${baseUrl}/live/create`,{waitUntil:"domcontentloaded"});
    await page.getByLabel("Event title",{exact:true}).waitFor();
    const nav=page.getByRole("navigation",{name:"Challenge builder steps"});
    check(await nav.getByRole("button").count()===5,"attendance builder exposes exactly five approved steps");
    await page.getByLabel("Event title",{exact:true}).fill("Live Event draft browser verification");
    await page.getByLabel("Category",{exact:true}).selectOption("Fitness");
    await page.getByLabel("Subcategory",{exact:true}).selectOption("Strength");
    await page.getByLabel("Event description",{exact:true}).fill("An isolated local event draft with actual authorized persistence.");
    await page.getByRole("button",{name:"Add Rule",exact:true}).click();
    await page.getByLabel("Rule 1",{exact:true}).fill("Respect everyone attending.");
    const creation=page.waitForResponse(response=>new URL(response.url()).pathname==="/api/challenges"&&response.request().method()==="POST");
    await page.getByRole("button",{name:"Continue",exact:true}).click();
    const created=await creation,envelope=await created.json();
    check(created.ok()&&envelope.ok,`Host Overview saves through the real draft handler (${created.status()})`);
    const draftId=envelope.data.challenge.id;
    check((await db.collection("challenges").doc(draftId).get()).data().hostOperations.schemaVersion===2,"saved draft uses the Live Event V2 schema");
    await page.getByLabel("Venue name",{exact:true}).waitFor();
    await page.reload({waitUntil:"domcontentloaded"});
    await nav.getByRole("button",{name:/Overview/}).click();
    await page.getByLabel("Event title",{exact:true}).waitFor();
    check(await page.getByLabel("Event title",{exact:true}).inputValue()==="Live Event draft browser verification","restoring the saved Overview preserves entered content");
    check(await page.getByLabel("Rule 1",{exact:true}).inputValue()==="Respect everyone attending.","restoring preserves ordered event rules");
    await page.screenshot({path:join(artifacts,`live-event-v2-builder-${builderFormat}-draft.png`),fullPage:true});
    await page.getByRole("button",{name:"Continue",exact:true}).click();
    const localInput=offset=>new Date(Date.now()+offset).toISOString().slice(0,16),day=86400000;
for(const [label,value] of [["Venue name","Verified local event venue"],["Full address","10 Test Street"],["City","Lagos"],["State or region","Lagos"],["Event timezone","UTC"],["Event start",localInput(5*day)],["Event end",localInput(5*day+3*3600000)],["Registration opens (optional; defaults to publication)",localInput(-60000)],["Registration closes (optional; defaults to event start)",localInput(4*day)],["Check-in opens (optional; defaults to event start)",localInput(5*day-3600000)],["Check-in closes (optional; defaults to event end)",localInput(5*day+3600000)],["Total venue capacity","20"]])await page.getByLabel(label,{exact:true}).fill(value);
    await page.getByLabel("Country",{exact:true}).selectOption("NG");
    await page.getByRole("button",{name:"Continue",exact:true}).click();
    await page.getByLabel("Event type",{exact:true}).waitFor();
    if(builderFormat==="physical_competition"){
      await page.getByLabel("Event type",{exact:true}).selectOption("physical_competition");
      await page.getByLabel("Maximum competitors",{exact:true}).fill("2");
      await page.getByLabel("Number of physical judges",{exact:true}).fill("2");
      await page.getByRole("button",{name:"Add Instruction",exact:true}).click();
      await page.getByLabel("Instruction 1",{exact:true}).fill("Bring your identity-bound Participant Pass to the physical judges.");
      check(await nav.getByRole("button").count()===6,"switching to physical competition adds only the approved prize step");
    }
    await page.getByRole("button",{name:"Continue",exact:true}).click();
    if(builderFormat==="physical_competition"){
      await page.getByLabel("Winner positions",{exact:true}).selectOption("2");
      await page.getByLabel("Prize description",{exact:true}).fill("Recognition for the two highest-scoring competitors.");
      await page.getByRole("button",{name:"Continue",exact:true}).click();
    }
    const eventCover=await require("sharp")({create:{width:800,height:500,channels:3,background:"#c8a755"}}).png().toBuffer();
    await page.getByLabel("Event cover file",{exact:true}).setInputFiles({name:"live-event-cover.png",mimeType:"image/png",buffer:eventCover});
    await page.getByRole("paragraph").filter({hasText:"Upload complete."}).waitFor();
    await page.getByRole("button",{name:"Continue",exact:true}).click();
    const summary=page.getByRole("region",{name:"Event review summary",exact:true});
    await summary.waitFor();check(await summary.getByText("Audience admission",{exact:true}).locator("..").getByText("Free",{exact:true}).isVisible(),"review shows actual free admission without promised funding");
    if(builderFormat==="physical_competition")check(await summary.getByText("70% / 30%",{exact:true}).isVisible(),"physical review uses the approved two-winner allocation without inventing cash");
    check(await summary.getByText("Full refund until 48 hours before",{exact:true}).isVisible(),"review discloses the actual saved refund policy");
    await page.getByLabel("The event details are accurate.",{exact:true}).check();
    await page.getByLabel("I have permission to use the uploaded content.",{exact:true}).check();
    const reviewResponse=page.waitForResponse(response=>new URL(response.url()).pathname===`/api/challenges/${draftId}/publish`&&response.request().method()==="POST");
    await page.getByRole("button",{name:"Publish",exact:true}).last().click();
    const submittedResponse=await reviewResponse,submittedEnvelope=await submittedResponse.json();
    check(submittedResponse.ok()&&submittedEnvelope.ok,`Live Event submits through actual upload verification and publication handler (${submittedResponse.status()}): ${JSON.stringify(submittedEnvelope).slice(0,3000)}`);
    await page.getByRole("heading",{name:"Event published",exact:true}).waitFor();
    const published=await context.request.get(`${baseUrl}/api/live-events/${draftId}/public`);
    check(published.ok(),"event is publicly discoverable through the real Live Event API without editorial approval");
    const finalEvent=(await db.collection("liveEvents").doc(draftId).get()).data();
    check(finalEvent.eventApprovalStatus==="approved"&&finalEvent.hostOperations.eventFormat===builderFormat,"automatic publication synchronizes the correct Live Event type atomically");
    await context.close();
  },{requiresMedia:true});
  }

  await test("Live Event V2 signed-out details and verified guest multiple-ticket booking", async () => {
    const eventId = `live_v2_browser_${runId}`, attendeeEvent = `${eventId}_attendance`;
    const start = Date.now() + 2 * 86400000;
    const fixture = { id:eventId,creatorId:users.creator.uid,title:"Physical event browser verification",description:"A real description with paragraphs.\n\nPhysical event details for local browser verification.",capacity:4,visibility:"public",status:"scheduled",eventApprovalStatus:"approved",startsAt:new Date(start).toISOString(),endsAt:new Date(start+7200000).toISOString(),venueName:"Local demo venue",eventAddress:"Test address",eventCity:"Lagos",eventCountry:"NG",hostOperations:{schemaVersion:2,eventFormat:"physical_competition",timezone:"Africa/Lagos",competitorCapacity:2,physicalJudgeCount:2,winnerCount:2,admissionRefundPolicy:"standard",registrationOpensAt:new Date(Date.now()-10000).toISOString(),registrationClosesAt:new Date(start).toISOString(),checkInStartAt:new Date(start-3600000).toISOString(),checkInEndAt:new Date(start+7200000).toISOString(),eventRules:["Respect guests"],competitionInstructions:["Arrive ready to compete"]} };
    await db.collection("liveEvents").doc(eventId).set(fixture);
    await db.collection("liveEvents").doc(attendeeEvent).set({...fixture,id:attendeeEvent,title:"Attendance browser verification",hostOperations:{...fixture.hostOperations,eventFormat:"attendance_only",competitorCapacity:0}});
    const context=await browser.newContext({viewport:{width:1280,height:900}}),page=await context.newPage();
    page.on("pageerror",error=>pageErrors.push(error.message));
    const response=await page.goto(`${baseUrl}/live-events/${eventId}`,{waitUntil:"domcontentloaded"});
    check(response.status()===200,"public event page returns HTTP 200");
    await page.getByRole("heading",{name:fixture.title,exact:true}).waitFor();
    check(await page.getByRole("tab").count()===4,"physical event exposes four initial information tabs");
    check(await page.getByRole("heading",{name:"Get Ticket",exact:true}).isVisible(),"audience booking is visible");
    check(await page.getByRole("heading",{name:"Join Entry",exact:true}).isVisible(),"competition booking is visible");
    await page.getByRole("tab",{name:"Instructions",exact:true}).click();
    await page.getByRole("heading",{name:"Before You Compete",exact:true}).waitFor();
    check(await page.getByText("Arrive ready to compete",{exact:true}).isVisible(),"published physical instructions are displayed");
    const {beginGuestVerification}=await import("../../lib/server/live-event-guests.ts");
    let verificationCode;
    // Only external mail delivery is deterministic. Verification, session cookies,
    // booking, capacity updates and ticket retrieval use actual application routes.
    await page.route(`**/api/live-events/${eventId}/guest-verification`,async route=>{
      const payload=route.request().postDataJSON();
      if(payload.action!=="send")return route.continue();
      const sent=await beginGuestVerification(db,eventId,payload.email,async email=>{verificationCode=email.text.match(/\b\d{6}\b/)[0];});
      await route.fulfill({status:200,contentType:"application/json",body:JSON.stringify({ok:true,data:sent,message:"Check your email for your verification code."})});
    });
    await page.getByLabel("Your email",{exact:true}).fill(`guest_${runId}@example.test`);
    const verificationSent=page.waitForResponse(reply=>new URL(reply.url()).pathname===`/api/live-events/${eventId}/guest-verification`&&reply.request().postDataJSON()?.action==="send");
    await page.getByRole("button",{name:"Send verification code",exact:true}).click();
    check((await verificationSent).status()===200,"deterministic email boundary creates a real single-use verification record");
    await page.getByLabel("Email verification code",{exact:true}).waitFor();
    await page.getByLabel("Email verification code",{exact:true}).fill(verificationCode);
    await page.getByRole("button",{name:"Verify email",exact:true}).click();
    await page.getByLabel("Guest 1 name",{exact:true}).fill("Browser guest one");
    await page.getByRole("button",{name:"Add guest",exact:true}).click();
    await page.getByLabel("Guest 2 name",{exact:true}).fill("Browser guest two");
    const booked=page.waitForResponse(reply=>new URL(reply.url()).pathname===`/api/live-events/${eventId}/bookings`&&reply.request().method()==="POST");
    await page.getByRole("button",{name:"Get tickets",exact:true}).click();
    check((await booked).status()===200,"verified guest books through actual server endpoint without an account");
    await page.getByRole("heading",{name:"My Tickets",exact:true}).waitFor();
    const guestPreference=page.getByRole("checkbox",{name:"Receive optional organizer announcement emails for this event",exact:true});
    await guestPreference.waitFor();
    const preferenceSaved=page.waitForResponse(reply=>new URL(reply.url()).pathname===`/api/live-events/${eventId}/email-preferences`&&reply.request().method()==="PATCH");
    await guestPreference.check();
    check((await preferenceSaved).ok(),"verified guest can opt into optional organizer announcements through the actual preference endpoint");
    const preferenceRemoved=page.waitForResponse(reply=>new URL(reply.url()).pathname===`/api/live-events/${eventId}/email-preferences`&&reply.request().method()==="PATCH");
    await expect(guestPreference).toBeChecked();
    await guestPreference.uncheck();
    check((await preferenceRemoved).ok(),"verified guest can withdraw announcement consent without creating an account");
    await expect(guestPreference).not.toBeChecked();
    await page.getByAltText("Admission QR code — present this at the event entrance",{exact:true}).first().waitFor();
    await page.addScriptTag({path:join(repoRoot,"node_modules/@zxing/browser/umd/zxing-browser.min.js")});
    const rawQr=await page.evaluate(async()=>{
      const reader=new window.ZXingBrowser.BrowserQRCodeReader();
      const image=document.querySelector('img[alt="Admission QR code — present this at the event entrance"]');await image.decode();
      const result=await reader.decodeFromImageElement(image);
      return result.getText();
    });
    const {readLiveEventTicketCode}=await import("../../lib/live-event-ticket-code.ts");
    const qrPayload=readLiveEventTicketCode(rawQr,eventId);
    check((await db.collection("liveEventTickets").doc(qrPayload.ticketId).get()).data()?.eventId===eventId,"actual rendered QR decodes into the correct event and individual ticket");
    const sharedContext=await browser.newContext();
    const sharedPage=await sharedContext.newPage();
    sharedPage.on("pageerror",error=>pageErrors.push(error.message));
    await sharedPage.goto(`${baseUrl}/live-events/${eventId}/ticket#${qrPayload.ticketId}.${qrPayload.credential}`,{waitUntil:"domcontentloaded"});
    await sharedPage.getByText("Ready to present at the entrance",{exact:true}).waitFor();
    check(await sharedPage.getByText("General Admission — valid for one person presenting this unused ticket",{exact:true}).isVisible(),"shared audience ticket works without purchaser authentication");
    check((await sharedPage.request.get(`${baseUrl}/api/live-events/${eventId}/tickets`)).status()===401,"a shared ticket never grants access to the purchaser's other tickets");
    check((await sharedPage.request.get(`${baseUrl}/api/live-events/${eventId}/email-preferences`)).status()===401,"a shared admission credential cannot change purchaser email preferences");
    await sharedContext.close();
    check((await db.collection("liveEventTickets").where("eventId","==",eventId).get()).size===2,"one admission credential is issued for each named guest");
    check((await db.collection("liveEvents").doc(eventId).get()).data().audienceCount===2,"capacity counts two tickets rather than one checkout");
    await page.screenshot({path:join(artifacts,"live-event-v2-desktop.png"),fullPage:true});
    await page.setViewportSize({width:390,height:844});
    check(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),"physical event fits a mobile viewport");
    await page.screenshot({path:join(artifacts,"live-event-v2-mobile.png"),fullPage:true});
    await page.goto(`${baseUrl}/live-events/${attendeeEvent}`,{waitUntil:"domcontentloaded"});
    await page.getByRole("heading",{name:"Attendance browser verification",exact:true}).waitFor();
    check(await page.getByRole("tab").count()===3,"attendance event has three information tabs");
    check(await page.getByRole("heading",{name:"Join Entry",exact:true}).count()===0,"attendance event never presents competition entry");
    await context.close();
  });
  check(pageErrors.length === 0, `Browser encountered uncaught client errors: ${pageErrors.join(" | ")}`);
} finally {
  if (browser) await browser.close().catch(() => undefined);
  if (nextProcess && nextProcess.exitCode === null) {
    if (process.platform === "win32") {
      try { execFileSync("taskkill", ["/PID", String(nextProcess.pid), "/T", "/F"], { stdio: "ignore" }); }
      catch { nextProcess.kill("SIGTERM"); }
    } else nextProcess.kill("SIGTERM");
  }
  if (buildProcess && buildProcess.exitCode === null) {
    if (process.platform === "win32") {
      try { execFileSync("taskkill", ["/PID", String(buildProcess.pid), "/T", "/F"], { stdio: "ignore" }); }
      catch { buildProcess.kill("SIGTERM"); }
    } else buildProcess.kill("SIGTERM");
  }
  removeNextGeneratedTsconfigIncludes();
  restoreNextGeneratedRouteTypeImport();
  await firebaseApp.delete().catch(() => undefined);
  writeFileSync(join(artifacts, "results.json"), JSON.stringify({ passed, failed: results.filter((result) => result.status === "FAIL").length, skipped: results.filter((result) => result.status === "SKIP").length, assertions, results, pageErrors, authResponses, authStorageSnapshots, browserDiagnostics, nextLog: serverLog.join("").slice(-12000) }, null, 2));
  console.log(`Browser QA artifacts: ${artifacts}`);
  console.log(`Browser journeys: ${passed}/${results.filter((result) => result.status !== "SKIP").length} passed; ${assertions} assertions.`);
  if (results.some((result) => result.status === "FAIL") || pageErrors.length) process.exitCode = 1;
}
