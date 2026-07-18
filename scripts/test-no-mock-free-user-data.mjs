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
const { isQaOrDemoRecord, isPublicChallenge, isPublicSubmission, isQaDemoOrPlaceholderProfile } = await import(pathToFileURL(join(tempDir, "public-challenge.ts")).href);

assert.equal(isPublicChallenge("real-public", { status: "published", visibility: "public" }), true);
assert.equal(isPublicChallenge("demo-public", { status: "published", visibility: "public", isDemo: true }), false);
assert.equal(isPublicChallenge("real-public", { title: "The Ultimate Showdown", status: "published", visibility: "public" }), false);
assert.equal(isPublicChallenge("real-public", { title: "The Next Model Spotlight Challenge", status: "published", visibility: "public" }), false);
assert.equal(isQaOrDemoRecord("real-id", { title: "QA Pending Challenge" }), true);
assert.equal(isQaDemoOrPlaceholderProfile("real-user", { displayName: "Demo Member", email: "demo-member@example.com" }), true);
assert.equal(isPublicChallenge("draft-public", { status: "draft", visibility: "public" }), false);
assert.equal(isPublicChallenge("private-public", { status: "published", visibility: "private" }), false);
assert.equal(isPublicSubmission("real-submission", { status: "approved", visibility: "public" }), true);
assert.equal(isPublicSubmission("demo-submission", { status: "approved", visibility: "public", isDemo: true }), false);
assert.equal(isPublicSubmission("private-submission", { status: "approved", visibility: "private" }), false);

const normalizers = readFileSync(join(root, "lib/api/normalizers.ts"), "utf8");
assert.equal(normalizers.includes("images.unsplash.com"), false, "challenge normalizer must not inject random external fallback images");
assert.equal(normalizers.includes("fallbackImageUrl"), false, "challenge normalizer must not use a fake fallback image constant");

const rewardWheel = readFileSync(join(root, "app/rewards/wheel/page.tsx"), "utf8");
assert.ok(rewardWheel.includes('rewardType: "visual_slot"'), "reward wheel should use neutral visual slots when no prizes are configured");
assert.ok(rewardWheel.includes('availability.state !== "setup_required"'), "reward wheel should keep Standard and Premium inside the same wheel structure.");
assert.equal(rewardWheel.includes('availability.state === "no_prizes" ? <WheelUnavailableState'), false, "reward wheel should not show a full setup screen only because a tier has no prizes.");

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
assert.ok(dashboardApi.includes("isQaOrDemoRecord"), "dashboard API should filter demo/QA records from personal dashboard data");
assert.ok(dashboardApi.includes("safeTotalPoints"), "dashboard API should normalize seeded profile points to zero");

const dashboardPage = readFileSync(join(root, "app/dashboard/page.tsx"), "utf8");
assert.equal(dashboardPage.includes("TrendingStories"), false, "dashboard home must not render trending discovery stories");
assert.equal(dashboardPage.includes("Top Performers"), false, "dashboard home must not render global top performers as personal data");
assert.equal(dashboardPage.includes("The Ultimate Showdown"), false, "dashboard home must not contain mock challenge titles");
assert.equal(dashboardPage.includes("Next Model Spotlight"), false, "dashboard home must not contain mock challenge titles");
assert.equal(dashboardPage.includes("12840"), false, "dashboard home must not contain hardcoded fake points");
assert.ok(dashboardPage.includes("No active challenges yet"), "dashboard home should show a personal empty state for brand-new users");

const explorePage = readFileSync(join(root, "app/explore/page.tsx"), "utf8");
assert.ok(explorePage.includes("TrendingStories"), "explore page should own trending discovery stories");
assert.ok(explorePage.includes('source="explore"'), "explore stories should use the explore source");

const sidebar = readFileSync(join(root, "components/sidebar.tsx"), "utf8");
assert.ok(sidebar.includes('href: "/explore", label: "Explore"'), "sidebar Explore should route to /explore");
assert.equal(sidebar.includes('href: "/feed", label: "Explore"'), false, "sidebar Explore should not route to /feed");

await rm(tempDir, { recursive: true, force: true });
console.log("No-mock free-user data checks passed.");
