import assert from "node:assert/strict";
import { read } from "./production-flow-test-utils.mjs";
const settlement = read("lib/server/prediction-settlement.ts");
assert(settlement.includes('["cancelled", "deleted"]') && settlement.includes("challenge_cancelled"));
assert(settlement.includes("predictionSettlementDisposition"));
console.log("cancelled challenge prediction disposition checks passed");
