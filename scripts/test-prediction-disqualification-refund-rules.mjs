import assert from "node:assert/strict";
import { read } from "./production-flow-test-utils.mjs";
const settlement = read("lib/server/prediction-settlement.ts");
assert(settlement.includes("targetDisqualified") && settlement.includes("predicted_participant_disqualified"));
assert(settlement.includes('settlementStatus: "refunded"') && settlement.includes("automaticRefundEnabled: false"));
console.log("prediction disqualification refund-review checks passed");
