import assert from "node:assert/strict";
import { read } from "./production-flow-test-utils.mjs";

const rewards = read("lib/server/rewards.ts");
const wheel = read("app/rewards/wheel/page.tsx");

assert(rewards.includes("thresholds: { basic: 100, standard: 250, premium: 500 }"));
assert(wheel.includes("activeConfig?.pointCost"));
assert(wheel.includes("wheelConfigs"));
assert(!wheel.includes("fallbackCosts"));
assert(!wheel.includes("Unlocked"));
console.log("Spin Wheel tier checks passed.");
