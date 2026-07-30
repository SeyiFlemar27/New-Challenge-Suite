import assert from "node:assert/strict";
import { read } from "./production-flow-test-utils.mjs";
const settlement = read("lib/server/challenge-settlement.ts");
const withdrawal = read("app/api/withdrawals/route.ts");
assert(settlement.includes('sourceType: "sponsor_prize"') && settlement.includes("SPONSOR_PRIZE_PLATFORM_FEE_PERCENT"));
assert(withdrawal.includes("netAmountCents") && !withdrawal.includes("SPONSOR_PRIZE_PLATFORM_FEE_PERCENT"));
console.log("sponsor prize second-fee prevention checks passed");
