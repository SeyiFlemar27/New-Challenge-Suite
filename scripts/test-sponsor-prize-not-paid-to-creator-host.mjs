import { assert, settlement } from "./settlement-test-utils.mjs";
const source = settlement();
assert(source.includes("creatorReceivesSponsorMoney: false"), "creator must receive no sponsor prize money");
assert(source.includes("grossAmountCents: breakdown.creatorHostAmount"), "creator credit must use challenge revenue creator amount");
assert(!source.includes("creatorHostAmount + breakdown.netSponsorPrizeAmount"), "creator credit must exclude sponsor funds");
console.log("creator sponsor-prize exclusion checks passed");
