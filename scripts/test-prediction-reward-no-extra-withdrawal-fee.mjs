import assert from "node:assert/strict";
import { read } from "./production-flow-test-utils.mjs";
const settlement = read("lib/server/prediction-settlement.ts");
assert(settlement.includes('sourceType: "prediction_reward"'));
assert(settlement.includes("withdrawalFeeRate: 0") && settlement.includes("winnerWithdrawalFeeApplies: false"));
console.log("prediction reward withdrawal fee checks passed");
