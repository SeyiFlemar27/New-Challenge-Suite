import assert from "node:assert/strict";
import { read } from "./production-flow-test-utils.mjs";

const rewards = read("lib/server/rewarded-ads.ts");
assert(rewards.includes("now.getTime() >= cooldownAt ? 0"));
assert(rewards.includes("currentCount + 1"));
console.log("rewarded-ad cooldown reset checks passed");
