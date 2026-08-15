import { assert, settlement } from "./settlement-test-utils.mjs";
const source = settlement();
assert(source.includes("SPONSOR_PRIZE_PLATFORM_FEE_PERCENT = 0"), "sponsor prize must not be diverted to platform revenue");
assert(source.includes("netSponsorPrizeAmount = grossConfirmedSponsorPrizeAmount - sponsorPrizePlatformFeeAmount"), "net sponsor prize must preserve the auditable fee field at zero");
assert(!source.includes("netSponsorPrizeAmount * SPONSOR_PRIZE_PLATFORM_FEE_PERCENT"), "net sponsor prize must not be charged again");
console.log("single sponsor prize fee checks passed");
