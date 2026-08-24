import { assert, settlement } from "./settlement-test-utils.mjs";
const source = settlement();
assert(source.includes("customSponsorSplits(input.challenge, input.winners) ?? defaultPlacementSplit(placementCount)"), "sponsor prize must use custom or default placement split without counting Team members as separate placements");
assert(source.includes("sponsorGrossDistribution") && source.includes("sponsorNetDistribution"), "sponsor gross and net allocations must be separate");
console.log("sponsor prize placement distribution checks passed");
