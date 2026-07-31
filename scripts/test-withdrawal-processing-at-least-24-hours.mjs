import assert from "node:assert/strict";
import { read } from "./production-flow-test-utils.mjs";
const architecture = read("lib/server/wallet-architecture.ts");
const withdrawals = read("lib/server/withdrawals.ts");
assert(architecture.includes("minimumProcessingHours: 24"));
assert(withdrawals.includes("earliestProcessingAt") && withdrawals.includes("MINIMUM_WITHDRAWAL_PROCESSING_HOURS"));
console.log("24-hour withdrawal processing checks passed");
