import assert from "node:assert/strict";
import { read } from "./production-flow-test-utils.mjs";

const rewards = read("lib/server/rewards.ts");
const wheel = read("app/rewards/wheel/page.tsx");
const geometry = read("lib/reward-wheel-geometry.ts");
const hub = read("app/rewards/page.tsx");
const history = read("app/rewards/history/page.tsx");
const claim = read("app/api/rewards/claim/route.ts");
const admin = read("app/admin/rewards/prize-wheel/page.tsx");
const prizeCatalog = read("app/admin/rewards/prize-catalog/page.tsx");
const sidebar = read("components/sidebar.tsx");
const earnings = read("app/earnings/page.tsx");

assert.match(rewards, /spinCosts: REWARD_WHEEL_POINT_COSTS/);
assert.match(wheel, /Confirm Spin/);
assert.match(wheel, /paymentSource/);
assert.match(wheel, /bonus_spin/);
assert.match(wheel, /resolvedProbability/);
assert.match(geometry, /probability \* 360/);
assert.match(wheel, /Possible Rewards/);
assert(!wheel.includes("RotateCcw"));
assert(!wheel.includes("Reset"));
assert(!wheel.includes("Unlocked"));
assert(!wheel.includes("Locked"));
assert(!wheel.includes("spin credit"));
assert(!wheel.includes("NO_SPINS"));
assert(!wheel.toLowerCase().includes("rarity"));
assert(!wheel.toLowerCase().includes("sound"));
assert.match(wheel, /prefers-reduced-motion/);
assert.match(wheel, /navigator\.vibrate/);

assert.match(rewards, /sourceType: "reward_spin_cash"/);
assert.match(rewards, /db\.collection\("cashLedger"\)/);
assert.match(rewards, /db\.collection\("cashWallets"\)/);
assert.match(rewards, /currency: "USD"/);
assert.match(rewards, /pendingBalanceCents: FieldValue\.increment/);
assert.match(rewards, /externalPayoutExecuted: false/);
assert.match(earnings, /reward_spin_cash/);
assert(!rewards.includes("payoutProviderCalled: true"));

assert.match(rewards, /SUPPORTED_SPIN_REWARD_TYPES/);
assert.match(history, /Reward Point credits and debits/);
assert.match(history, /Reward Grant/);
assert.match(history, /Entitlement/);
assert.match(history, /Fulfillment/);
assert.ok(!history.includes("physical_item"));

for (const type of ["reward_points", "dorocoin", "cash", "free_entry", "fixed_entry_discount", "percentage_entry_discount", "creator_boost", "bonus_spin"]) assert(prizeCatalog.includes(`value="${type}"`), `missing structured Prize Catalog type ${type}`);
for (const removedType of ["physical_item", "badge"]) assert(!prizeCatalog.includes(`value="${removedType}"`), `removed Reward type is still active: ${removedType}`);
assert(prizeCatalog.includes("Delivery country codes"));
assert(prizeCatalog.includes("Available quantity"));
assert(!prizeCatalog.includes('label="Reward type"><input'));
assert(!admin.includes("Create Prize"), "Prize creation must not be embedded in Wheel configuration");

for (const heading of ["Spin & Win", "Daily streak", "Earn Points", "Achievements", "Your Rewards", "Recent Rewards"]) assert(hub.includes(heading), `missing Reward Hub section ${heading}`);
assert(!hub.includes("Lifetime Earned"));
assert(!hub.includes("Available rewards"));

assert.match(sidebar, /label: "Build a Challenge"/);
for (const label of ["Normal", "Private", "Live Event", "Tournament"]) assert(sidebar.includes(`label: "${label}"`));
assert.match(sidebar, /const \[open, setOpen\] = useState\(false\)/);
assert(!sidebar.includes("useState(childRouteActive)"));
assert.match(sidebar, /toLocaleString\(\)\} DC/);
assert.match(sidebar, /DoroCoins\. Open DoroCoin wallet/);

assert.match(rewards, /const existingSpin = await spinRef\.get\(\)/);
const executeSpin = rewards.slice(rewards.indexOf("export async function executeRewardSpin"));
assert(executeSpin.indexOf("const existingSpin") < executeSpin.indexOf("chooseRewardPrize"), "idempotency lookup must precede prize selection");
assert.match(rewards, /transaction\.get\(spinRef\)/);
assert.match(rewards, /serverSelected: true/);
assert(!rewards.includes("Math.random"));
const prizeLoader = rewards.slice(rewards.indexOf("export async function loadRewardPrizes"), rewards.indexOf("export function publicPrize"));
assert(!prizeLoader.includes("DEFAULT_REWARD_PRIZES"), "code-defined fallback prizes must not be returned as live production inventory");

console.log("Rewards Spin Wheel final contracts passed.");
