import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { mkdir, rm, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";

const root = resolve(new URL("..", import.meta.url).pathname.replace(/^\/(.:\/)/, "$1"));
const tempDir = join(root, ".tmp-production-no-mock-backend");
await rm(tempDir, { recursive: true, force: true });
await mkdir(tempDir, { recursive: true });

function read(file) {
  return readFileSync(join(root, file), "utf8");
}
function assertNotIncludes(source, value, message) {
  assert.equal(source.includes(value), false, message);
}
function assertIncludes(source, value, message) {
  assert.equal(source.includes(value), true, message);
}

const publicChallengeSource = read("lib/server/public-challenge.ts");
await writeFile(join(tempDir, "public-challenge.ts"), publicChallengeSource, "utf8");
const { isQaOrDemoRecord, isPublicChallenge, isPublicSubmission, isQaDemoOrPlaceholderProfile } = await import(pathToFileURL(join(tempDir, "public-challenge.ts")).href);

assert.equal(isQaOrDemoRecord("real-id", { title: "The Ultimate Showdown" }), true, "known mock challenge title must be non-production");
assert.equal(isQaOrDemoRecord("real-id", { title: "The Next Model Spotlight Challenge" }), true, "known model spotlight mock title must be non-production");
assert.equal(isQaOrDemoRecord("real-id", { title: "QA Pending Challenge" }), true, "QA challenge title must be non-production");
assert.equal(isQaOrDemoRecord("demo-sub-rainline-reflections", { title: "Rainline Reflections" }), true, "demo winner title must be non-production");
assert.equal(isPublicChallenge("real-public", { title: "Real Launch Challenge", status: "published", visibility: "public" }), true, "real public challenge stays visible");
assert.equal(isPublicChallenge("real-public", { title: "The Ultimate Showdown", status: "published", visibility: "public" }), false, "mock public challenge title stays hidden");
assert.equal(isPublicSubmission("real-sub", { title: "Rainline Reflections", status: "approved", visibility: "public" }), false, "mock winner submission title stays hidden");
assert.equal(isQaDemoOrPlaceholderProfile("real-user", { displayName: "Demo Member", email: "demo-member@example.com" }), true, "seeded profile must be detected");

const dashboardApi = read("app/api/dashboard/route.ts");
assertIncludes(dashboardApi, "isQaOrDemoRecord", "dashboard API filters demo/QA records");
assertIncludes(dashboardApi, "isQaDemoOrPlaceholderProfile", "dashboard API detects seeded profiles");
assertIncludes(dashboardApi, "safeTotalPoints", "dashboard API normalizes seeded profile points to zero");
assertIncludes(dashboardApi, "challengeParticipants", "dashboard uses participant records for joined challenges");
assertIncludes(dashboardApi, "submissions", "dashboard uses submission records for submitted challenges");
assertNotIncludes(dashboardApi, 'orderBy("createdAt", "desc").limit(6)', "dashboard does not query public feed as current challenges");
assertIncludes(dashboardApi, "leaderboard: []", "dashboard does not return global leaderboard rows");

const dashboardPage = read("app/dashboard/page.tsx");
for (const forbidden of ["The Ultimate Showdown", "The Next Model Spotlight", "12840", "12,840", "Top Voter", "Verified Competitor", "TrendingStories", "Top Performers"]) {
  assertNotIncludes(dashboardPage, forbidden, `dashboard page must not contain ${forbidden}`);
}
assertIncludes(dashboardPage, "No active challenges yet", "dashboard has brand-new empty state");
assertIncludes(dashboardPage, "Challenges you join, create, or submit entries to will appear here.", "dashboard explains personal challenge criteria");

const subscriptions = read("app/subscriptions/page.tsx");
for (const forbidden of ["Sponsor Starter", "Brand Partner", "Enterprise Partner", "Sponsors & Brands", "Sponsor & Brands"]) {
  assertNotIncludes(subscriptions, forbidden, `/subscriptions must not contain ${forbidden}`);
}
const sponsorPlans = read("app/sponsor/plans/page.tsx");
assertIncludes(sponsorPlans, "sponsorPlanCards", "sponsor plans remain in sponsor area");

const leaderboards = read("app/leaderboards/page.tsx");
for (const forbidden of ["Theo Grant", "Demo Member", "Top Voter", "12840", "12,840"]) {
  assertNotIncludes(leaderboards, forbidden, `leaderboards must not contain fake row ${forbidden}`);
}
const winners = read("app/winners/page.tsx");
for (const forbidden of ["Rainline", "Reflections", "demo-sub", "payout review not active"]) {
  assertNotIncludes(winners, forbidden, `winners page must not contain fake winner ${forbidden}`);
}

const sponsorDashboard = read("app/sponsor/dashboard/page.tsx");
for (const forbidden of ["payment completed", "brand approved automatically", "email sent", "Sponsor tools unlocked"]) {
  assertNotIncludes(sponsorDashboard.toLowerCase(), forbidden.toLowerCase(), `sponsor dashboard must not claim ${forbidden}`);
}
const sponsorFinance = read("components/sponsor/sponsor-finance-pages.tsx");
assertNotIncludes(sponsorFinance, "Download PDF</Button>", "billing must not expose fake invoice download button");
assertNotIncludes(sponsorFinance.toLowerCase(), "fake invoice", "billing must not present fake invoices");

const customization = read("app/settings/customization/page.tsx");
for (const forbidden of ["12840", "12.8k", "Neon City Photo Battle", "Creator Showdown", "Sample Member"]) {
  assertNotIncludes(customization, forbidden, `settings customization preview must not contain fake production value ${forbidden}`);
}

await rm(tempDir, { recursive: true, force: true });
console.log("Production no-mock backend checks passed.");
