import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFileSync, mkdirSync, writeFileSync } from "node:fs";
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
const { chromium } = require("@playwright/test");
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
const isolatedNextDistDir = `.next/e2e/${runId}`;
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
  NEXT_PUBLIC_DISABLE_MEDIA_UPLOADS: "true",
  NEXT_PUBLIC_INITIAL_ADMIN_EMAILS: "",
  ADMIN_EMAIL_ALLOWLIST: "",
  STRIPE_SECRET_KEY: "",
  STRIPE_WEBHOOK_SECRET: "",
  RESEND_API_KEY: "",
  GOOGLE_CLIENT_ID: "",
  GOOGLE_CLIENT_SECRET: "",
  NEXT_PUBLIC_GOOGLE_CLIENT_ID: ""
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

async function test(name, fn) {
  if (journeyFilter && !name.toLowerCase().includes(journeyFilter)) {
    results.push({ name, status: "SKIP", assertions: 0, message: "Filtered out by CHALLENGE_SUITE_E2E_JOURNEY." });
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
const serverEnv = { ...process.env, NODE_ENV: nextMode === "production" ? "production" : "development", NEXT_TELEMETRY_DISABLED: "1" };
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
          const loginMarker = /Sign In|Loading sign-in|Opening your workspace|We couldn't open your workspace/i.test(html);
          if (contentType.includes("text/html") && loginMarker) return;
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
    db.collection("enterpriseFinanceWallets").doc(enterpriseOrg).set({ organizationId: enterpriseOrg, currency: "USD", pendingBalanceCents: 0, lifetimeChallengeRevenueCents: 0, withdrawalsEnabled: false })
  ]);
  const publicChallengeId = `journey_${runId}_normal`;
  const privateChallengeId = `journey_${runId}_private`;
  const liveEventId = `journey_${runId}_event`;
  const tournamentId = `journey_${runId}_tournament`;
  const now = new Date().toISOString();
  const past = new Date(Date.now() - 3600000).toISOString();
  const future = new Date(Date.now() + 86400000).toISOString();
  await Promise.all([
    db.collection("challenges").doc(publicChallengeId).set({
      id: publicChallengeId, creatorId: creator.uid, creatorName: "Journey creator", title: "Autumn Portrait Challenge",
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
      description: "A physical event registration fixture.", status: "scheduled", startsAt: future,
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

  await test("Creator login establishes a server session and Explore renders API-backed challenge", async () => {
    const page = await login(desktop, creator);
    const cookie = (await page.context().cookies()).find((item) => item.name === "challenge_suite_session");
    check(Boolean(cookie?.httpOnly), "Login should establish an HttpOnly server session cookie.");
    const exploreResponse = await page.request.get(`${baseUrl}/api/explore/challenges?q=Autumn%20Portrait`);
    check(exploreResponse.ok(), `Explore API should return success (HTTP ${exploreResponse.status()}).`);
    const exploreData = await exploreResponse.json();
    check(exploreData.data?.challenges?.some((item) => item.id === publicChallengeId), "Seeded published challenge should be returned by Explore API.");
    await page.getByPlaceholder("Search challenges, creators, categories").fill("Autumn Portrait");
    await page.getByRole("button", { name: "Search", exact: true }).click();
    await page.getByText("Autumn Portrait Challenge").first().waitFor({ timeout: 15000 });
    check(await page.getByText("Autumn Portrait Challenge").count() > 0, "Explore UI should render the API-backed challenge.");
    await page.screenshot({ path: join(artifacts, "creator-explore-desktop.png"), fullPage: true });
  });

  await test("Private requester submits access request through UI and persisted request is pending", async () => {
    const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
    const page = await login(context, participant, { rememberMe: true });
    await page.goto(`${baseUrl}/private-exclusive`, { waitUntil: "domcontentloaded" });
    await page.getByText("Locked Art Opportunity").waitFor({ timeout: 15000 }).catch(async () => {
      const response = await page.request.get(`${baseUrl}/api/private-exclusive`);
      const body = await response.text();
      const storage = await page.evaluate(async () => ({ localStorageKeys: Object.keys(localStorage), sessionStorageKeys: Object.keys(sessionStorage), databases: (await indexedDB.databases()).map((database) => database.name) }));
      throw new Error(`Private UI did not render the public locked preview; API HTTP ${response.status()} body=${body.slice(0, 1600)}; page=${(await page.locator("body").innerText()).slice(0, 1000)}; storage=${JSON.stringify(storage)}`);
    });
    await page.getByRole("button", { name: "Request Access" }).click();
    await page.getByLabel("Reason for access").fill("I would like to join this art challenge.");
    const accessRequestResponse = page.waitForResponse((response) => {
      return new URL(response.url()).pathname === "/api/private-exclusive" && response.request().method() === "POST";
    }, { timeout: interactionTimeout });
    await page.getByRole("button", { name: "Send Request" }).click();
    const requestResponse = await accessRequestResponse;
    const requestEnvelope = await requestResponse.json().catch(() => null);
    check(requestResponse.ok() && requestEnvelope?.ok === true, `Private access request API should accept the submitted form (HTTP ${requestResponse.status()}, code=${String(requestEnvelope?.code ?? "unknown")}).`);
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
    page.once("dialog", (dialog) => dialog.accept());
    await page.getByRole("button", { name: "Approve" }).click();
    await page.getByText("approved", { exact: false }).waitFor({ timeout: 12000 });
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
    await sponsorPage.getByText("Autumn Portrait Challenge").waitFor({ timeout: 15000 });
    check(await sponsorPage.getByText("Autumn Portrait Challenge").count() > 0, "Sponsor discovery UI should render the API-backed opportunity.");
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

  await test("Individual Tournament registration and physical Live Event registration persist from browser forms", async () => {
    const tournamentContext = await browser.newContext({ viewport: { width: 1280, height: 800 } });
    const tournamentPage = await login(tournamentContext, participant, { rememberMe: true });
    await tournamentPage.goto(`${baseUrl}/tournaments/${tournamentId}`, { waitUntil: "domcontentloaded" });
    const tournamentJoinLink = tournamentPage.getByRole("link", { name: "Join / Apply" });
    const tournamentJoinHref = await tournamentJoinLink.getAttribute("href");
    const tournamentJoinNavigation = tournamentPage.waitForURL(`**/tournaments/${tournamentId}/join`, { timeout: navigationTimeout });
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
    await tournamentContext.close();

    const eventContext = await browser.newContext({ viewport: { width: 390, height: 844 } });
    const eventPage = await login(eventContext, participant, { rememberMe: true });
    await eventPage.goto(`${baseUrl}/live-events`, { waitUntil: "domcontentloaded" });
    await eventPage.getByText("In-Person Art Gathering").waitFor({ timeout: 15000 });
    const eventRegisterLink = eventPage.getByRole("link", { name: "Register to Attend" });
    const eventRegisterHref = await eventRegisterLink.getAttribute("href");
    const eventRegisterNavigation = eventPage.waitForURL(`**/live-events/${liveEventId}/register`, { timeout: navigationTimeout });
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
  writeFileSync(join(artifacts, "results.json"), JSON.stringify({ passed, failed: results.length - passed, assertions, results, pageErrors, authResponses, authStorageSnapshots, browserDiagnostics, nextLog: serverLog.join("").slice(-12000) }, null, 2));
  console.log(`Browser QA artifacts: ${artifacts}`);
  console.log(`Browser journeys: ${passed}/${results.filter((result) => result.status !== "SKIP").length} passed; ${assertions} assertions.`);
  if (results.some((result) => result.status === "FAIL") || pageErrors.length) process.exitCode = 1;
}
