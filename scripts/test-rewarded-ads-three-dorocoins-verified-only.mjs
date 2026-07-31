import assert from "node:assert/strict";
import { read } from "./production-flow-test-utils.mjs";

const rewards = read("lib/server/rewarded-ads.ts");
const route = read("app/api/ad-votes/route.ts");
assert(rewards.includes("REWARDED_AD_DOROCOINS = 3"));
assert(rewards.includes("if (!input.providerVerified)") && rewards.includes('input.completionStatus !== "completed"'));
assert(route.includes("providerVerificationRequired: true") && route.includes("voteGranted: false"));
console.log("verified rewarded-ad amount checks passed");
