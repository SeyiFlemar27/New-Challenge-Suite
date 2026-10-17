import assert from "node:assert/strict";
import { buildSettlementBreakdown } from "../lib/server/challenge-settlement.ts";
const challenge = { settlementEntityType: "tournament", configVersion: 3 };
const winners = [1, 2, 3].map(placement => ({ userId: `winner_${placement}`, placement, submissionId: null, splitPercent: 0 }));
let assertions = 0;
for (const amount of [0, 1, 7, 99, 100, 501, 10001]) {
  const input = { challenge, winners, confirmedEntryRevenueCents: amount, confirmedPaidVoteRevenueCents: amount, confirmedSponsorPrizeCents: amount, confirmedCreatorPrizeCents: amount };
  const result = buildSettlementBreakdown(input);
  const pool = result.winnerPoolAmount + result.netSponsorPrizeAmount;
  const totals = result.winnerDistribution.map((row, index) => row.netAmountCents + result.sponsorPrizeDistribution[index].netAmountCents);
  assert.deepEqual(totals, [Math.floor(pool * .60), Math.floor(pool * .25), pool - Math.floor(pool * .60) - Math.floor(pool * .25)]); assertions++;
  assert.equal(totals.reduce((a, b) => a + b, 0) + result.creatorHostAmount + result.platformChallengeFeeAmount, amount * 4); assertions++;
  const bronze = buildSettlementBreakdown({ ...input, challenge: { ...challenge, thirdPlaceOutcome: "unawarded" }, winners: winners.slice(0, 2) });
  assert.equal(bronze.unawardedThirdPlaceHoldCents, totals[2]); assertions++;
  assert.equal(bronze.winnerDistribution.reduce((sum, row) => sum + row.netAmountCents, 0) + bronze.sponsorPrizeDistribution.reduce((sum, row) => sum + row.netAmountCents, 0) + bronze.unawardedThirdPlaceHoldCents, pool); assertions++;
}
assert.throws(() => buildSettlementBreakdown({ challenge, winners: winners.slice(0, 2), confirmedEntryRevenueCents: 100, confirmedPaidVoteRevenueCents: 0, confirmedSponsorPrizeCents: 0 }), /OFFICIAL_PLACEMENTS_REQUIRED/); assertions++;
const team = buildSettlementBreakdown({ challenge, winners: winners.flatMap(winner => [0, 1].map(allocationOrder => ({ ...winner, userId: `${winner.userId}_${allocationOrder}`, allocationOrder }))), confirmedEntryRevenueCents: 0, confirmedPaidVoteRevenueCents: 0, confirmedSponsorPrizeCents: 10001 });
for (const placement of [1, 2, 3]) {
  const members = team.sponsorPrizeDistribution.filter(row => row.placement === placement);
  assert.ok(Math.abs(members[0].netAmountCents - members[1].netAmountCents) <= 1); assertions++;
}
console.log(`Tournament allocation: ${assertions} deterministic assertions passed; no provider execution.`);
