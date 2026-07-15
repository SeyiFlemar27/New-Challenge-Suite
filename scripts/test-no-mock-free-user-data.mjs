import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { mkdir, rm, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";

const root = resolve(new URL("..", import.meta.url).pathname.replace(/^\/(.:\/)/, "$1"));
const tempDir = join(root, ".tmp-no-mock-free-user-data");
await rm(tempDir, { recursive: true, force: true });
await mkdir(tempDir, { recursive: true });

const publicChallengeSource = readFileSync(join(root, "lib/server/public-challenge.ts"), "utf8");
await writeFile(join(tempDir, "public-challenge.ts"), publicChallengeSource, "utf8");
const { isPublicChallenge, isPublicSubmission } = await import(pathToFileURL(join(tempDir, "public-challenge.ts")).href);

assert.equal(isPublicChallenge("real-public", { status: "published", visibility: "public" }), true);
assert.equal(isPublicChallenge("demo-public", { status: "published", visibility: "public", isDemo: true }), false);
assert.equal(isPublicChallenge("draft-public", { status: "draft", visibility: "public" }), false);
assert.equal(isPublicChallenge("private-public", { status: "published", visibility: "private" }), false);
assert.equal(isPublicSubmission("real-submission", { status: "approved", visibility: "public" }), true);
assert.equal(isPublicSubmission("demo-submission", { status: "approved", visibility: "public", isDemo: true }), false);
assert.equal(isPublicSubmission("private-submission", { status: "approved", visibility: "private" }), false);

const normalizers = readFileSync(join(root, "lib/api/normalizers.ts"), "utf8");
assert.equal(normalizers.includes("images.unsplash.com"), false, "challenge normalizer must not inject random external fallback images");
assert.equal(normalizers.includes("fallbackImageUrl"), false, "challenge normalizer must not use a fake fallback image constant");

const rewardWheel = readFileSync(join(root, "app/rewards/wheel/page.tsx"), "utf8");
assert.ok(rewardWheel.includes("if (!source.length) return []"), "reward wheel should not render fallback prize slices when no prizes are configured");
assert.ok(rewardWheel.includes('availability.state === "no_prizes"'), "reward wheel should show setup/unavailable state for missing prize configuration");

const rewardsServer = readFileSync(join(root, "lib/server/rewards.ts"), "utf8");
assert.ok(rewardsServer.includes("const displayPrizes = prizeSetupRequired ? [] : prizes"), "reward summary should hide default setup prizes from public prize lists");

const winnersApi = readFileSync(join(root, "app/api/winners/route.ts"), "utf8");
assert.ok(winnersApi.includes("isPublicChallenge"), "winners API should filter inaccessible/demo challenges");
assert.ok(winnersApi.includes("isPublicSubmission"), "winners API should filter inaccessible/demo submissions");

const engagementsApi = readFileSync(join(root, "app/api/engagements/route.ts"), "utf8");
assert.ok(engagementsApi.includes("isPublicChallenge"), "saved challenges API should filter inaccessible/demo challenges");

const dashboardApi = readFileSync(join(root, "app/api/dashboard/route.ts"), "utf8");
assert.equal(dashboardApi.includes('db.collection("challenges").orderBy("createdAt"'), false, "dashboard API must not load a public challenge feed as personal challenges");
assert.ok(dashboardApi.includes('db.collection("challengeParticipants").where("userId", "==", user.uid)'), "dashboard API should load joined challenges through user participant records");
assert.ok(dashboardApi.includes('leaderboard: []'), "dashboard API should not return global leaderboard rows as dashboard performers");

const dashboardPage = readFileSync(join(root, "app/dashboard/page.tsx"), "utf8");
assert.equal(dashboardPage.includes("TrendingStories"), false, "dashboard home must not render trending discovery stories");
assert.equal(dashboardPage.includes("Top Performers"), false, "dashboard home must not render global top performers as personal data");
assert.ok(dashboardPage.includes("No active challenges yet"), "dashboard home should show a personal empty state for brand-new users");

const explorePage = readFileSync(join(root, "app/explore/page.tsx"), "utf8");
assert.ok(explorePage.includes("TrendingStories"), "explore page should own trending discovery stories");
assert.ok(explorePage.includes('source="explore"'), "explore stories should use the explore source");

const sidebar = readFileSync(join(root, "components/sidebar.tsx"), "utf8");
assert.ok(sidebar.includes('href: "/explore", label: "Explore"'), "sidebar Explore should route to /explore");
assert.equal(sidebar.includes('href: "/feed", label: "Explore"'), false, "sidebar Explore should not route to /feed");

await rm(tempDir, { recursive: true, force: true });
console.log("No-mock free-user data checks passed.");
