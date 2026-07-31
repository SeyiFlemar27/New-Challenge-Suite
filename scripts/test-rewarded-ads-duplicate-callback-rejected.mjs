import assert from "node:assert/strict";
import { read } from "./production-flow-test-utils.mjs";

const rewards = read("lib/server/rewarded-ads.ts");
assert(rewards.includes("existingProviderEventIds.includes(input.providerEventId)"));
assert(rewards.includes("DUPLICATE_PROVIDER_EVENT"));
console.log("rewarded-ad duplicate callback checks passed");
