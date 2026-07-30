import assert from "node:assert/strict";
import { read } from "./production-flow-test-utils.mjs";
const settlement = read("lib/server/challenge-settlement.ts");
const reporting = read("lib/server/sponsor-reporting.ts");
assert(settlement.includes("grossConfirmedSponsorPrizeAmount") && settlement.includes("grossConfirmedChallengeRevenue"));
assert(reporting.includes("confirmedSponsorFundsCents"));
console.log("sponsor funding separation checks passed");
