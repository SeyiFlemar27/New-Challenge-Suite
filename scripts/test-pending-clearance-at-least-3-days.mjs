import assert from "node:assert/strict";
import { read } from "./production-flow-test-utils.mjs";
const architecture = read("lib/server/wallet-architecture.ts");
const payout = read("lib/server/payout-structure.ts");
assert(architecture.includes("pendingClearanceDays: 3"));
assert(payout.includes("CASH_EARNING_HOLD_HOURS = 72"));
console.log("three-day pending clearance checks passed");
