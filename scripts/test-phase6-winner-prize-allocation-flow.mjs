import assert from "node:assert/strict";
import { read } from "./production-flow-test-utils.mjs";
const source = read(
"lib/server/prize-approvals.ts"
);
assert(source.includes("usesConfirmedSourcesOnly"), "missing " + "usesConfirmedSourcesOnly");
assert(source.includes("pending_hold"), "missing " + "pending_hold");
assert(source.includes("kycRequiredBeforeWithdrawal"), "missing " + "kycRequiredBeforeWithdrawal");
assert(source.includes("payoutProviderCalled: false"), "missing " + "payoutProviderCalled: false");
console.log("test-phase6-winner-prize-allocation-flow checks passed");
