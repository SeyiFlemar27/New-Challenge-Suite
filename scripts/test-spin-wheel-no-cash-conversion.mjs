import assert from "node:assert/strict";
import { read } from "./production-flow-test-utils.mjs";

const rewards = read("lib/server/rewards.ts");
const prizesRoute = read("app/api/rewards/prizes/route.ts");

assert(rewards.includes("cashOutEnabled: false"));
assert(rewards.includes("Rewards cannot be cashed out."));
assert(rewards.includes("No DoroCoin-to-cash conversion."));
assert(prizesRoute.includes("cashOutEnabled: false"));
console.log("Spin Wheel no-cash-conversion checks passed.");
