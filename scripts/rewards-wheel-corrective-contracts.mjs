import assert from "node:assert/strict";
import vm from "node:vm";
import ts from "typescript";
import { exists, read } from "./production-flow-test-utils.mjs";

const rewards = read("lib/server/rewards.ts");
const wheel = read("app/rewards/wheel/page.tsx");
const geometrySource = read("lib/reward-wheel-geometry.ts");
const adminWheel = read("app/admin/rewards/prize-wheel/page.tsx");
const wheelApi = read("app/api/admin/rewards/wheels/route.ts");
const adjustmentApi = read("app/api/admin/rewards/adjustments/route.ts");
const adjustmentPage = read("app/admin/rewards/adjustments/page.tsx");
const rewardEconomy = read("lib/server/reward-economy.ts");
const sidebar = read("components/sidebar.tsx");
const workspaceBoundary = read("components/workspace-route-boundary.tsx");
const workspaceApi = read("app/api/auth/workspace/route.ts");
const currentUser = read("lib/hooks/use-current-user.ts");
const provider = read("components/i18n/i18n-provider.tsx");
const languageHook = read("lib/i18n/use-language.ts");

const starterTable = rewards.slice(rewards.indexOf("export const DEFAULT_REWARD_PRIZES"), rewards.indexOf("function wheelEntrySignature"));
for (const marker of [
  '"launch-basic-20-dorocoins", "20 DoroCoins", "basic", "dorocoin", "common", 30',
  '"launch-basic-250-points", "250 Reward Points", "basic", "reward_points", "very_rare", 1',
  '"launch-standard-75-dorocoins", "75 DoroCoins", "standard", "dorocoin", "common", 26',
  '"launch-standard-5-free-entry", "Free Entry Credit up to $5", "standard", "free_entry", "very_rare", 1',
  '"launch-premium-150-dorocoins", "150 DoroCoins", "premium", "dorocoin", "common", 22',
  '"launch-premium-1000-points", "1,000 Reward Points", "premium", "reward_points", "very_rare", 1',
]) assert.ok(starterTable.includes(marker), `missing safe starter entry ${marker}`);
assert.ok(!starterTable.includes('"cash"'), "starter wheel must not invent a Cash prize");
assert.ok(!starterTable.includes('"physical_item"'), "starter wheel must not invent a physical prize");
assert.match(rewards, /rewardWheelActiveVersions/);
assert.match(rewards, /rewardWheelVersions/);
assert.match(rewards, /pointerSnaps\.every\(\(snap\) => snap\.exists\)/);
assert.match(rewards, /if \(pointerSnaps\[index\]\.exists\) continue/);
assert.match(rewards, /source = configured\.length \? configured : legacy\.length \? legacy : DEFAULT_REWARD_PRIZES/);
assert.match(rewards, /resolveRewardWheel/);
assert.match(rewards, /const prizes = wheel\.prizes/);
assert.match(rewards, /const pointCost = wheel\.pointCost/);
assert.match(rewards, /wheelPointerSnap\.data\(\)\?\.versionId !== versionId/);
assert.match(rewards, /WHEEL_VERSION_CHANGED/);

const compiledGeometry = ts.transpileModule(geometrySource, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText;
const geometryModule = { exports: {} };
vm.runInNewContext(compiledGeometry, { module: geometryModule, exports: geometryModule.exports, Math, Number });
const { buildRewardWheelSegments, rewardWheelLandingRotation } = geometryModule.exports;
const segments = buildRewardWheelSegments([
  { id: "a", resolvedProbability: 0.7 },
  { id: "b", resolvedProbability: 0.2975 },
  { id: "tiny", resolvedProbability: 0.0025 },
]);
assert.equal(segments.length, 3);
assert.ok(Math.abs(segments.at(-1).endAngle - 360) < 1e-9);
assert.ok(Math.abs(segments.reduce((sum, segment) => sum + segment.endAngle - segment.startAngle, 0) - 360) < 1e-9);
assert.ok(Math.abs((segments[2].endAngle - segments[2].startAngle) - 0.9) < 1e-9, "0.25% remains a true 0.9 degree segment");
const landing = rewardWheelLandingRotation(0, segments[1].midpoint);
assert.ok(Math.abs(((landing + segments[1].midpoint) % 360 + 360) % 360) < 1e-9, "landing aligns committed segment midpoint to pointer");
assert.match(wheel, /buildRewardWheelSegments\(prizes\)/);
assert.match(wheel, /rewardWheelLandingRotation\(current, selected\.midpoint\)/);
assert.match(wheel, /same published reward pool shown on the wheel/);
assert.match(wheel, /Balance before/);
assert.match(wheel, /Spin cost/);
assert.match(wheel, /Balance after/);
assert.match(wheel, /Loading reward wheel/);
assert.match(wheel, /temporarily unavailable/);
for (const forbidden of ["rarity", "sound", "Reset", "NO SPINS", "unlock"]) assert.ok(!wheel.toLowerCase().includes(forbidden.toLowerCase()), `wheel must not show ${forbidden}`);

assert.match(adminWheel, /Save Draft/);
assert.match(adminWheel, /Publish Version/);
assert.match(adminWheel, /Exact probability/);
assert.match(adminWheel, /Wheel Preview/);
assert.match(adminWheel, /100,000 Spin projection/);
assert.match(adminWheel, /Point return ratio/);
assert.match(wheelApi, /requireAdminPermission\(request, "rewards\.configure"\)/);
assert.match(wheelApi, /requireRecentAdminAuthentication\(request, "rewards\.publish"\)/);
assert.match(rewards, /status: "published", immutable: true/);
assert.match(rewards, /WHEEL_ENTRIES_REQUIRED/);
assert.match(rewards, /WHEEL_REWARD_POINT_RETURN_BLOCKED/);

assert.match(adjustmentPage, /User Adjustments/);
assert.match(adjustmentPage, /Reward Wheel QA/);
assert.match(adjustmentPage, /CONFIRM REWARD CREDIT/);
assert.match(adjustmentPage, /CONFIRM REWARD DEBIT/);
assert.match(adjustmentApi, /requireRecentAdminAuthentication\(request, "rewards\.adjustUser"\)/);
assert.match(rewardEconomy, /sourceType: "admin_adjustment"/);
assert.match(rewardEconomy, /CONFIRM REWARD CREDIT/);
assert.match(rewardEconomy, /CONFIRM REWARD DEBIT/);
assert.match(rewardEconomy, /deterministicId\("reward_adjustment"/);
assert.match(rewardEconomy, /rewardLedgerEntries/);
assert.ok(!adjustmentPage.includes("setAvailablePoints"));

assert.match(sidebar, /label: "Build a Challenge"/);
for (const label of ["Normal", "Private", "Live Event", "Tournament", "Challenges", "My Entries", "Submissions"]) assert.ok(sidebar.includes(`label: "${label}"`), `missing Personal navigation label ${label}`);
for (const route of ["/creator/private-challenges", "/host/private", "/host/live-events", "/host/tournaments"]) assert.ok(!sidebar.includes(`href: "${route}"`), `duplicate standalone sidebar route remains: ${route}`);
for (const file of ["app/creator/private-challenges/page.tsx", "app/host/private/page.tsx", "app/host/live-events/page.tsx", "app/host/tournaments/page.tsx"]) assert.ok(exists(file), `underlying deep route must remain: ${file}`);

assert.ok(!workspaceBoundary.includes("Opening the correct workspace"));
assert.ok(!workspaceBoundary.includes("window.location.replace"));
assert.match(workspaceBoundary, /apiRequest<\{ activeWorkspace: WorkspaceId \}>\("\/api\/auth\/workspace"/);
assert.match(workspaceBoundary, /challenge-suite-profile-updated/);
assert.match(workspaceApi, /requireAuthenticatedUser/);
assert.match(currentUser, /pendingBootstrap/);
assert.match(currentUser, /cachedBootstrap/);

const selectorHosts = [
  "components/authenticated-topbar.tsx",
  "components/public-site/public-shell.tsx",
  "app/settings/page.tsx",
  "app/auth/login/page.tsx",
  "app/auth/register/page.tsx",
];
for (const file of selectorHosts) assert.ok(!read(file).includes("LanguageSelector"), `visible language selector remains in ${file}`);
assert.ok(exists("components/i18n/language-selector.tsx"), "language selector implementation must remain recoverable");
assert.ok(exists("lib/i18n/config.ts"), "translation resources must remain recoverable");
assert.ok(!provider.includes("MutationObserver"));
assert.ok(!provider.includes("readBrowserLanguagePreference"));
assert.match(provider, /document\.documentElement\.lang = DEFAULT_LANGUAGE/);
assert.match(languageHook, /translate\(DEFAULT_LANGUAGE, key\)/);

assert.match(sidebar, /toLocaleString\(\)\} DC/);
assert.match(sidebar, /DoroCoins\. Open DoroCoin wallet/);

console.log("Rewards wheel corrective contracts passed.");
