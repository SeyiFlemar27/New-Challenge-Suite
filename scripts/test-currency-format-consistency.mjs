import assert from "node:assert/strict";
import { read } from "./production-flow-test-utils.mjs";
const utils = read("lib/utils.ts");
const earnings = read("app/earnings/page.tsx");
const prediction = read("app/challenges/[id]/prediction/page.tsx");
assert(utils.includes("moneyFromCents") && utils.includes("maximumFractionDigits: amount % 1 === 0 ? 0 : 2"));
assert(earnings.includes("moneyFromCents") && prediction.includes("moneyFromCents"));
console.log("currency format consistency checks passed");
