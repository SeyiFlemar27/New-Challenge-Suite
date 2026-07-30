import assert from "node:assert/strict";
import { read } from "./production-flow-test-utils.mjs";

const rewards = read("lib/server/rewards.ts");
const route = read("app/api/rewards/spin/route.ts");
const admin = read("app/api/admin/rewards/prizes/route.ts");

assert(rewards.includes("chooseRewardPrize"));
assert(rewards.includes("randomInt"));
assert(rewards.includes("probabilityWeight"));
assert(rewards.includes("serverSelected: true"));
assert(route.includes("executeRewardSpin"));
assert(!route.includes("prizeId"));
assert(admin.includes("requireAdminUser"));
console.log("Spin Wheel server-selected weighted reward checks passed.");
