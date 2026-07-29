import { assert, settlement, splitSponsorPrize } from "./settlement-test-utils.mjs";
assert.deepEqual(splitSponsorPrize(100000), { gross: 100000, fee: 15000, net: 85000 });
const source = settlement();
assert(source.includes("SPONSOR_PRIZE_PLATFORM_FEE_PERCENT = 15"), "sponsor prize fee must be 15%");
assert(source.includes("sponsorPrizePlatformFeeAmount"), "settlement must record sponsor prize fee");
console.log("sponsor prize settlement fee checks passed");
