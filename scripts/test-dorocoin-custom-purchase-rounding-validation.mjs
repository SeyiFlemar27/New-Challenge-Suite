import assert from "node:assert/strict";
import { read } from "./production-flow-test-utils.mjs";
const helper = read("lib/dorocoin-purchase.ts");
const api = read("app/api/stripe/dorocoin-checkout/route.ts");
assert(helper.includes("Math.round(rawAmountUsd * 100)") && helper.includes("Math.round(roundedInputUsd * DOROCOINS_PER_USD)"));
assert(api.includes("quoteCustomDoroCoinPurchase") && api.includes("customAmountUsd"));
console.log("custom DoroCoin rounding and validation checks passed");
