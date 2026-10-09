import assert from "node:assert/strict";
import { buildSettlementBreakdown, enterpriseSettlementSourcesMatchChallenge } from "../lib/server/challenge-settlement.ts";

const breakdown = buildSettlementBreakdown({
  challenge: { officialChallenge: true, organizationOwnerId: "org-1", creatorId: "actor-1" },
  winners: [{ userId: "winner-1", submissionId: "submission-1", placement: 1, splitPercent: 100 }],
  confirmedEntryRevenueCents: 0,
  confirmedPaidVoteRevenueCents: 0,
  confirmedSponsorPrizeCents: 0,
  confirmedCreatorPrizeCents: 0,
  confirmedPromotionalPrizeCents: 100000,
});

assert.equal(breakdown.grossConfirmedPromotionalPrizeAmount, 100000);
assert.equal(breakdown.winnerPoolAmount, 100000);
assert.equal(breakdown.winnerDistribution[0].grossAmountCents, 100000);
assert.equal(breakdown.creatorHostAmount, 0, "admin promotional prize funding is not creator revenue");
assert.equal(breakdown.platformChallengeFeeAmount, 0, "admin promotional prize funding is not platform revenue");
const currentSources = { pendingEntryFeeRevenueGrossCents: 20000, confirmedPaidVoteGrossCents: 5000, confirmedSponsorContributionCents: 30000, confirmedCreatorPrizeFundingCents: 40000, confirmedPlatformPromotionalCents: 100000 };
const previewBreakdown = { grossConfirmedChallengeRevenue: 25000, grossConfirmedSponsorPrizeAmount: 30000, grossConfirmedCreatorPrizeAmount: 40000, grossConfirmedPromotionalPrizeAmount: 100000 };
assert.equal(enterpriseSettlementSourcesMatchChallenge(currentSources, previewBreakdown), true);
assert.equal(enterpriseSettlementSourcesMatchChallenge({ ...currentSources, confirmedSponsorContributionCents: 0 }, previewBreakdown), false, "a refund completed after preview invalidates the stale settlement amounts");
console.log("PASS Enterprise promotional prize funding reaches the winner distribution without becoming creator or platform revenue");
