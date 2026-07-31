import assert from "node:assert/strict";
import { read } from "./production-flow-test-utils.mjs";

const rewards = read("lib/server/rewarded-ads.ts");
assert(rewards.includes("REWARDED_AD_CYCLE_LIMIT = 10"));
assert(rewards.includes("REWARDED_AD_COOLDOWN_MS = 2 * 60 * 60 * 1000"));
assert(rewards.includes("cycleCount >= REWARDED_AD_CYCLE_LIMIT"));
console.log("rewarded-ad cycle cooldown checks passed");
