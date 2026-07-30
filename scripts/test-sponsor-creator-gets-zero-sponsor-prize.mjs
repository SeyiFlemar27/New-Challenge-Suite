import assert from "node:assert/strict";
import { read } from "./production-flow-test-utils.mjs";
const settlement = read("lib/server/challenge-settlement.ts");
assert(settlement.includes("creatorHostAmount"));
assert(settlement.includes("grossConfirmedSponsorPrizeAmount"));
assert(!settlement.includes("creatorHostAmount: sponsor"));
console.log("sponsor creator zero-allocation checks passed");
