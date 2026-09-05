import assert from "node:assert/strict";
import vm from "node:vm";
import ts from "typescript";
import { read } from "./production-flow-test-utils.mjs";

const rewards = read("lib/server/rewards.ts");
const economy = read("lib/server/reward-economy.ts");
const contracts = read("lib/reward-wheel-contracts.ts");
const userWheel = read("app/rewards/wheel/page.tsx");
const wheelVisual = read("components/rewards/reward-wheel-visual.tsx");
const adminWheel = read("app/admin/rewards/prize-wheel/page.tsx");
const adminSettings = read("app/admin/rewards/settings/page.tsx");
const adminCatalog = read("app/admin/rewards/prize-catalog/page.tsx");
const stripeWebhook = read("app/api/stripe/webhook/route.ts");

const compiled = ts.transpileModule(contracts, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
}).outputText;
const module = { exports: {} };
vm.runInNewContext(compiled, { module, exports: module.exports, Math, Number });
assert.deepEqual(
  JSON.parse(JSON.stringify(module.exports.REWARD_WHEEL_POINT_COSTS)),
  { basic: 100, standard: 250, premium: 500 },
);

assert.match(rewards, /thresholds: REWARD_WHEEL_POINT_COSTS, spinCosts: REWARD_WHEEL_POINT_COSTS/);
assert.match(rewards, /pointCost !== REWARD_WHEEL_POINT_COSTS\[input\.tier\]/);
assert.match(rewards, /WHEEL_POINT_COST_LOCKED/);
assert.ok(!adminWheel.includes('onChange={(event) => setPointCost'));
assert.ok(!adminSettings.includes("Basic threshold"));
assert.match(adminSettings, /Fixed platform cost/);

assert.match(rewards, /if \(options\.requireExactTotal && ids\.size < 4\) throw new Error\("WHEEL_MINIMUM_REWARDS_REQUIRED"\)/);
assert.match(rewards, /if \(prizes\.length < 4\) throw new Error\("WHEEL_MINIMUM_REWARDS_REQUIRED"\)/);
assert.match(adminWheel, /entries\.length >= 4/);
assert.match(adminWheel, /Add at least four unique Prizes to publish/);

assert.ok(!rewards.includes("DEFAULT_REWARD_PRIZES"));
assert.match(rewards, /setupRequired: true/);
assert.ok(!rewards.includes("reward_wheel_starter_seeded"));

assert.ok(!userWheel.includes("Odds reflect"));
assert.ok(!userWheel.includes("resolvedProbability) * 100"));
assert.match(wheelVisual, /showAccessibleProbabilities = false/);
assert.match(adminWheel, /showAccessibleProbabilities/);

assert.match(rewards, /deterministicId\("reward_grant", spinId\)/);
assert.match(rewards, /collection\("rewardGrants"\)/);
assert.match(rewards, /sourceType: "reward_spin", status: "granted", immutable: true/);
assert.match(rewards, /rewardGrantId, spinId/);

assert.match(economy, /entitlementExpiry\(input\.expiresAt\)/);
assert.ok(!economy.includes('type === "creator_boost" ? 60 : 30'));
assert.match(economy, /maximumFeeCents/);
assert.match(adminCatalog, /Maximum discount in USD cents/);
assert.match(rewards, /WHEEL_ENTRY_DISCOUNT_CAP_REQUIRED/);
assert.match(rewards, /SUPPORTED_SPIN_REWARD_TYPES/);
assert.match(rewards, /spinCreditExpiryDays: null/);
assert.ok(!adminCatalog.includes('<option value="physical_item">'));
assert.ok(!adminCatalog.includes('<option value="badge">'));

assert.match(economy, /"dorocoin_purchase"/);
assert.match(rewards, /eventType: "dorocoin_purchase"/);
assert.match(rewards, /sourceEventKey: `dorocoin-purchase:/);
assert.match(stripeWebhook, /awardDoroCoinPurchaseRewards/);
assert.ok(!rewards.includes('skipped: "reward_points_are_earned_only"'));

console.log("Rewards full production contracts passed.");
