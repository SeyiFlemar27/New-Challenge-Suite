import { chromium } from "@playwright/test";
import { existsSync } from "node:fs";

const accountVariables = {
  normal_user: ["ECONOMY_QA_USER_EMAIL", "ECONOMY_QA_USER_PASSWORD"],
  creator: ["ECONOMY_QA_CREATOR_EMAIL", "ECONOMY_QA_CREATOR_PASSWORD"],
  sponsor: ["ECONOMY_QA_SPONSOR_EMAIL", "ECONOMY_QA_SPONSOR_PASSWORD"],
  admin: ["ECONOMY_QA_ADMIN_EMAIL", "ECONOMY_QA_ADMIN_PASSWORD"],
  super_admin: ["ECONOMY_QA_SUPER_ADMIN_EMAIL", "ECONOMY_QA_SUPER_ADMIN_PASSWORD"]
};
const missing = ["ECONOMY_QA_BASE_URL", ...Object.values(accountVariables).flat()].filter((name) => !process.env[name]);
if (missing.length) {
  console.log(JSON.stringify({ status: "BLOCKED_MISSING_CONFIGURATION", missingVariables: missing, secretsPrinted: false }, null, 2));
  process.exit(2);
}

const baseUrl = new URL(process.env.ECONOMY_QA_BASE_URL).origin;
const roleRoutes = {
  normal_user: ["/wallet", "/dorocoins", "/challenge-credits"],
  creator: ["/dashboard/host", "/creator/growth-wallet", "/profile"],
  sponsor: ["/sponsor/dashboard", "/sponsor/campaigns"],
  admin: ["/admin/developer-tools/economy-rules"],
  super_admin: ["/admin/developer-tools/economy-rules"]
};
const results = [];
const systemChromiumCandidates = [process.env.ECONOMY_QA_CHROMIUM_EXECUTABLE, "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe", "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe", "/usr/bin/chromium", "/usr/bin/google-chrome"].filter(Boolean);
const executablePath = systemChromiumCandidates.find((path) => existsSync(path));
const browser = await chromium.launch({ headless: true, ...(executablePath ? { executablePath } : {}) });
try {
  for (const [accountType, [emailName, passwordName]] of Object.entries(accountVariables)) {
    const context = await browser.newContext();
    const page = await context.newPage();
    const failures = [];
    page.on("pageerror", (error) => failures.push(`pageerror:${error.message}`));
    await page.goto(`${baseUrl}/auth/login?next=${encodeURIComponent(roleRoutes[accountType][0])}`, { waitUntil: "domcontentloaded" });
    await page.locator('input[type="email"]').fill(process.env[emailName]);
    await page.locator('input[type="password"]').fill(process.env[passwordName]);
    await page.locator('button[type="submit"]').click();
    await page.waitForLoadState("domcontentloaded");
    for (const route of roleRoutes[accountType]) {
      const response = await page.goto(`${baseUrl}${route}`, { waitUntil: "domcontentloaded" });
      const body = await page.locator("body").innerText();
      if (!response || response.status() >= 500 || /Internal Server Error|Application error/i.test(body)) failures.push(`${route}:server-error`);
      if (["/dorocoins", "/challenge-credits", "/creator/growth-wallet"].includes(route) && /\bWithdraw\b/i.test(body)) failures.push(`${route}:noncash-withdraw-control`);
    }
    results.push({ accountType, status: failures.length ? "FAIL" : "PASS", failures });
    await context.close();
  }
} finally {
  await browser.close();
}
console.log(JSON.stringify({ status: results.every((item) => item.status === "PASS") ? "PASS" : "FAIL", results, secretsPrinted: false, providerSuccessSimulated: false }, null, 2));
process.exitCode = results.some((item) => item.status === "FAIL") ? 1 : 0;
