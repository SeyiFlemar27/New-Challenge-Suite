import assert from "node:assert/strict";
import { read } from "./production-flow-test-utils.mjs";

const source = read("lib/server/prediction-settlement.ts");
assert(source.includes('sourceType: "prediction_reward"'));
assert(source.includes("withdrawalFeeRate: 0"));
assert(source.includes("winnerWithdrawalFeeApplies: false"));
assert(!source.includes("0.15"));
assert(!source.includes("15%"));
console.log("prediction reward withdrawal-fee isolation checks passed");
