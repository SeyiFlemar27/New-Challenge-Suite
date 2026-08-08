import { chromium } from "@playwright/test";
import { existsSync } from "node:fs";

const baseUrl = new URL(process.env.ECONOMY_QA_BASE_URL || "http://127.0.0.1:3000").origin;
const publicRoutes = ["/", "/dorocoins", "/challenge-credits", "/auth/login", "/subscriptions"];
const authenticatedRoutes = {
  normal_user: { vars: ["ECONOMY_QA_USER_EMAIL", "ECONOMY_QA_USER_PASSWORD"], routes: ["/wallet", "/dorocoins", "/challenge-credits"] },
  creator: { vars: ["ECONOMY_QA_CREATOR_EMAIL", "ECONOMY_QA_CREATOR_PASSWORD"], routes: ["/dashboard/host", "/creator/growth-wallet"] },
  sponsor: { vars: ["ECONOMY_QA_SPONSOR_EMAIL", "ECONOMY_QA_SPONSOR_PASSWORD"], routes: ["/sponsor/dashboard", "/sponsor/campaigns"] },
  admin: { vars: ["ECONOMY_QA_ADMIN_EMAIL", "ECONOMY_QA_ADMIN_PASSWORD"], routes: ["/admin/developer-tools/economy-rules"] }
};
const viewports = [{ name: "mobile", width: 390, height: 844 }, { name: "desktop", width: 1440, height: 900 }];
const results = [];
const systemChromiumCandidates = [process.env.ECONOMY_QA_CHROMIUM_EXECUTABLE, "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe", "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe", "/usr/bin/chromium", "/usr/bin/google-chrome"].filter(Boolean);
const executablePath = systemChromiumCandidates.find((path) => existsSync(path));
const browser = await chromium.launch({ headless: true, ...(executablePath ? { executablePath } : {}) });

async function inspect(context, route, viewport, authState = "public") {
  const page = await context.newPage();
  await page.setViewportSize(viewport);
  const issues = [];
  page.on("console", (message) => { if (message.type() === "error" && !message.text().includes("/_next/webpack-hmr")) issues.push(`console:${message.text().slice(0, 180)}`); });
  page.on("pageerror", (error) => issues.push(`pageerror:${error.message.slice(0, 180)}`));
  page.on("requestfailed", (request) => issues.push(`network:${new URL(request.url()).pathname}`));
  const response = await page.goto(`${baseUrl}${route}`, { waitUntil: "networkidle" });
  const body = await page.locator("body").innerText();
  const authRequired = /Restoring your session|Log in to continue|Sign in to continue/i.test(body) || new URL(page.url()).pathname.startsWith("/auth/login");
  if (!response || response.status() >= 500 || /Internal Server Error|Application error|__next_error__/i.test(body)) issues.push("server-error-marker");
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1);
  if (overflow) issues.push("horizontal-overflow");
  if (/Challenge Coin/i.test(body)) issues.push("forbidden-challenge-coin-wording");
  if (!authRequired && ["/dorocoins", "/challenge-credits", "/creator/growth-wallet"].includes(route) && /\bWithdraw\b/i.test(body)) issues.push("noncash-withdraw-control");
  if (!authRequired && ["/dorocoins", "/challenge-credits"].includes(route) && !/(not withdrawable|cannot be withdrawn|not cash)/i.test(body)) issues.push("missing-noncash-disclaimer");
  results.push({ route, viewport: `${viewport.width}x${viewport.height}`, authState, status: issues.length ? "FAIL" : authRequired && route !== "/auth/login" ? "SKIPPED_AUTH_REQUIRED" : "PASS", issues });
  await page.close();
}

try {
  for (const viewport of viewports) {
    const context = await browser.newContext({ viewport });
    for (const route of publicRoutes) await inspect(context, route, viewport);
    await context.close();
  }
  for (const [accountType, config] of Object.entries(authenticatedRoutes)) {
    if (config.vars.some((name) => !process.env[name])) {
      results.push({ accountType, status: "SKIPPED_AUTH_REQUIRED", missingVariables: config.vars.filter((name) => !process.env[name]) });
      continue;
    }
    const context = await browser.newContext();
    const page = await context.newPage();
    await page.goto(`${baseUrl}/auth/login?next=${encodeURIComponent(config.routes[0])}`, { waitUntil: "domcontentloaded" });
    await page.locator('input[type="email"]').fill(process.env[config.vars[0]]);
    await page.locator('input[type="password"]').fill(process.env[config.vars[1]]);
    await page.locator('button[type="submit"]').click();
    await page.waitForLoadState("domcontentloaded");
    await page.close();
    for (const viewport of viewports) for (const route of config.routes) await inspect(context, route, viewport, accountType);
    await context.close();
  }
} finally {
  await browser.close();
}
const failures = results.filter((item) => item.status === "FAIL");
console.log(JSON.stringify({ status: failures.length ? "FAIL" : "PASS_WITH_AUTH_SKIPS", baseUrl, browserRuntime: executablePath ? "system_chromium" : "playwright_chromium", screenshotsSaved: false, tracesSaved: false, results }, null, 2));
process.exitCode = failures.length ? 1 : 0;
