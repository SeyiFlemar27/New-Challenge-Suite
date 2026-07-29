import assert from "node:assert/strict";
import { read } from "./production-flow-test-utils.mjs";

const helper = read("lib/server/predictions.ts");
assert(helper.includes("PREDICTION_PLATFORM_FEE_RATE = 0.07"));
const gross = 10_000;
const fee = Math.round(gross * 0.07);
assert.equal(fee, 700);
assert.equal(gross - fee, 9_300);
assert(helper.includes("Math.round(grossPredictionPoolCents * PREDICTION_PLATFORM_FEE_RATE)"));
console.log("prediction seven-percent fee checks passed");
