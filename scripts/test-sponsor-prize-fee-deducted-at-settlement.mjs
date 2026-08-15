import { assert, settlement, splitSponsorPrize } from "./settlement-test-utils.mjs";
assert.deepEqual(splitSponsorPrize(100000), { gross: 100000, fee: 0, net: 100000 });
const source = settlement();
assert(source.includes("SPONSOR_PRIZE_PLATFORM_FEE_PERCENT = 0"), "sponsor prize funding must remain entirely allocated to winner-purpose credits");
assert(source.includes("sponsorPrizePlatformFeeAmount"), "settlement must record sponsor prize fee");
console.log("sponsor prize settlement fee checks passed");
