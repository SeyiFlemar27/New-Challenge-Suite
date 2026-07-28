import assert from "node:assert/strict";
import { read } from "./production-flow-test-utils.mjs";
const source = read(
"lib/server/payout-structure.ts"
);
assert(source.includes("winnerSharePercent: 65"), "missing " + "winnerSharePercent: 65");
assert(source.includes("creatorHostOperatorSharePercent: 20"), "missing " + "creatorHostOperatorSharePercent: 20");
assert(source.includes("platformAdminSharePercent: 15"), "missing " + "platformAdminSharePercent: 15");
assert(source.includes("after_provider_payment_confirmation"), "missing " + "after_provider_payment_confirmation");
console.log("test-phase6-settlement-65-20-15-confirmed-payments checks passed");
