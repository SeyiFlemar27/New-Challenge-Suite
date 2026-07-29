import { assert, settlement } from "./settlement-test-utils.mjs";
const source = settlement();
assert(source.includes("challenge.sponsorPrizeDistribution") && source.includes("challenge.sponsorDistribution"), "configured sponsor distributions must be supported");
assert(source.includes("validPercentSplits"), "custom sponsor distribution must validate positions and 100% total");
assert(source.includes("customSponsorAmountDistribution") && source.includes("total === cents(grossAmountCents)"), "custom sponsor amount distribution must equal the confirmed sponsor pool");
console.log("custom sponsor prize distribution checks passed");
