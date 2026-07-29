import { assert, settlement } from "./settlement-test-utils.mjs";
const source = settlement();
assert(source.includes("grossConfirmedChallengeRevenue = cents(input.confirmedEntryRevenueCents) + cents(input.confirmedPaidVoteRevenueCents)"), "challenge revenue must include only entry and paid-vote revenue");
assert(source.includes("sponsorMoneyExcludedFromChallengeSplit: true"), "sponsor money must be excluded from 65/20/15");
assert(!source.includes("calculatePaidRevenueSplit(grossConfirmedSponsorPrizeAmount)"), "sponsor money must not enter the challenge split");
console.log("sponsor exclusion from 65/20/15 checks passed");
