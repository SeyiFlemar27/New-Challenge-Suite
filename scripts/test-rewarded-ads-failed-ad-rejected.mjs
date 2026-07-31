import assert from "node:assert/strict";
import { read } from "./production-flow-test-utils.mjs";

const rewards = read("lib/server/rewarded-ads.ts");
assert(rewards.includes('input.completionStatus !== "completed"'));
assert(rewards.includes("AD_NOT_COMPLETED") && rewards.includes("rewardAmount: 0"));
console.log("failed rewarded-ad rejection checks passed");
