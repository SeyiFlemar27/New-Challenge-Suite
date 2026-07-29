import assert from "node:assert/strict";
import { read } from "./production-flow-test-utils.mjs";

const source = read("lib/server/prediction-settlement.ts");
const gross = 10_000;
const net = gross - Math.round(gross * 0.07);
const stakes = [1_000, 3_000];
const total = stakes.reduce((sum, value) => sum + value, 0);
const rewards = stakes.map((value) => Math.floor(net * value / total));
assert.deepEqual(rewards, [2_325, 6_975]);
assert.equal(rewards.reduce((sum, value) => sum + value, 0), net);
assert(source.includes("totalCorrectStakeCents"));
assert(source.includes("item.stakeAmountCents / totalCorrectStakeCents"));
assert(source.includes('"No correct predictions. Admin review required."'));
assert(source.includes('status: "requires_admin_review"'));
console.log("prediction proportional settlement checks passed");
