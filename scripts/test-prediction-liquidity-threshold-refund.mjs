import assert from "node:assert/strict";
import { read } from "./production-flow-test-utils.mjs";
const helper = read("lib/server/predictions.ts");
const settlement = read("lib/server/prediction-settlement.ts");
assert(helper.includes("DEFAULT_PREDICTION_LIQUIDITY_THRESHOLD_CENTS = 10_000"));
assert(settlement.includes("minimum_liquidity_not_met") && settlement.includes('status: "refunded_review"'));
assert(settlement.includes("providerRefundExecuted: false"));
console.log("prediction liquidity refund-review checks passed");
