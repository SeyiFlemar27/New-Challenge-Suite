import { assert, settlement, splitChallengeRevenue } from "./settlement-test-utils.mjs";
assert.deepEqual(splitChallengeRevenue(100000), { winner: 65000, creator: 20000, platform: 15000 });
const source = settlement();
assert(source.includes("calculatePaidRevenueSplit(grossConfirmedChallengeRevenue)"), "settlement must use canonical paid revenue split");
assert(source.includes("winnerPoolAmount") && source.includes("creatorHostAmount") && source.includes("platformChallengeFeeAmount"), "settlement must store all 65/20/15 buckets");
console.log("challenge settlement 65/20/15 checks passed");
