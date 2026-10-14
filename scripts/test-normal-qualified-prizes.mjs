import assert from "node:assert/strict";
import { allocateNormalQualifiedPrizeCents } from "../lib/normal-challenge-prize-allocation.ts";
import { normalizeWinnerProposalWinners, validateWinnerProposalWinners } from "../lib/server/prize-approvals.ts";
import { buildSettlementBreakdown } from "../lib/server/challenge-settlement.ts";
let count = 0;
for (const amount of [0, 1, 5, 85, 500, 10001, 9999999999]) {
  const allocations = allocateNormalQualifiedPrizeCents(amount, 3, 2);
  assert.equal(allocations[0].amountCents, Number(BigInt(amount) * 60n / 85n)); count++;
  assert.equal(allocations.reduce((sum, item) => sum + item.amountCents, 0), amount); count++;
  assert.ok(allocations.every(item => Number.isSafeInteger(item.amountCents) && item.amountCents >= 0)); count++;
}
const challenge = { builderVersion: "normal_v3", numberOfWinners: 3 };
const winners = normalizeWinnerProposalWinners([{ userId: "first", submissionId: "first", placement: 1 }, { userId: "second", submissionId: "second", placement: 2 }], challenge);
assert.equal(validateWinnerProposalWinners(winners, challenge).valid, true); count++;
assert.equal(validateWinnerProposalWinners([], challenge).valid, false); count++;
assert.equal(allocateNormalQualifiedPrizeCents(100, 3, 0).length, 0); count++;
assert.deepEqual(allocateNormalQualifiedPrizeCents(100, 3, 1).map(item => item.amountCents), [100]); count++;
for (const creator of [0, 1, 2, 99, 10001]) for (const sponsor of [0, 1, 2, 99]) {
  const entries = [1, 2, 3].map(placement => ({ userId: `winner_${placement}`, submissionId: `submission_${placement}`, placement, splitPercent: [60, 25, 15][placement - 1] }));
  const result = buildSettlementBreakdown({ challenge, winners: entries, confirmedEntryRevenueCents: 0, confirmedPaidVoteRevenueCents: 0, confirmedSponsorPrizeCents: sponsor, confirmedCreatorPrizeCents: creator });
  const target = allocateNormalQualifiedPrizeCents(creator + sponsor, 3, 3);
  assert.deepEqual(result.winnerDistribution.map((item, index) => item.netAmountCents + result.sponsorPrizeDistribution[index].netAmountCents), target.map(item => item.amountCents)); count++;
  assert.equal(result.winnerDistribution.reduce((sum, item) => sum + item.netAmountCents, 0), creator); count++;
  assert.equal(result.sponsorPrizeDistribution.reduce((sum, item) => sum + item.netAmountCents, 0), sponsor); count++;
  assert.ok(result.sponsorPrizeDistribution.every(item => item.netAmountCents >= 0)); count++;
}
console.log(`Qualified Normal prizes: ${count} assertions passed.`);
