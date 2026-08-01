import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
const pool = readFileSync("lib/server/prize-pools.ts", "utf8");
const settlement = readFileSync("lib/server/challenge-settlement.ts", "utf8");
assert(pool.includes("disputeHoldHours: 24"), "prize pool must declare a 24-hour dispute hold");
assert(settlement.includes("holdUntilFromApproval(now, CASH_EARNING_HOLD_HOURS)"), "settlement must calculate hold from approval");
assert(settlement.includes("availableAt: null"), "settlement credits must not become immediately available");
assert(settlement.includes("withdrawalsEnabled: false"), "settlement must not unlock withdrawals");
console.log("24-hour prize dispute hold checks passed");
