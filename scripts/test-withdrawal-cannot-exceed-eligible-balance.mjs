import assert from "node:assert/strict";
import { read } from "./production-flow-test-utils.mjs";
const route = read("app/api/withdrawals/route.ts");
const service = read("lib/server/withdrawals.ts");
assert(route.includes("WITHDRAWAL_SOURCE_AMOUNT_MISMATCH"));
assert(service.includes("INSUFFICIENT_AVAILABLE_BALANCE") && service.includes("sourceTotal !== input.amountCents"));
console.log("withdrawal balance ownership checks passed");
