import assert from "node:assert/strict";
import { read } from "./production-flow-test-utils.mjs";
const source = read(
"lib/server/withdrawals.ts"
);
assert(source.includes("payoutProvider: \"manual\""), "missing " + "payoutProvider: \"manual\"");
assert(source.includes("payoutProviderReference: null"), "missing " + "payoutProviderReference: null");
assert(source.includes("payoutExecuted: false"), "missing " + "payoutExecuted: false");
console.log("test-phase6-no-provider-payout-execution checks passed");
