import assert from "node:assert/strict";
import { read } from "./production-flow-test-utils.mjs";
const helper = read("lib/server/predictions.ts");
const api = read("app/api/predictions/route.ts");
const page = read("app/challenges/[id]/prediction/page.tsx");
assert(helper.includes("PREDICTION_MIN_STAKE_CENTS = 500") && helper.includes("PREDICTION_MAX_STAKE_CENTS = 50_000"));
assert(api.includes("between $5 and $500"));
assert(page.includes('min="5"') && page.includes("amountCents < 500"));
console.log("$5-$500 prediction stake limit checks passed");
