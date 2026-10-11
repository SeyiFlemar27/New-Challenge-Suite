import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { calculateNormalWinnerAmountsCents, normalWinnerDistribution } from "../lib/normal-challenge-prize-allocation.ts";

const read = (path) => readFileSync(new URL(path, import.meta.url), "utf8");
const payout = read("../lib/server/payout-structure.ts");
const planAccess = read("../lib/plan-access.ts");
const createRoute = read("../app/api/challenges/route.ts");
const publishRoute = read("../app/api/challenges/[id]/publish/route.ts");
const settlement = read("../lib/server/challenge-settlement.ts");
const proposal = read("../lib/server/prize-approvals.ts");

assert.deepEqual(normalWinnerDistribution(1), [{ position: 1, percent: 100 }]);
assert.deepEqual(normalWinnerDistribution(3), [
  { position: 1, percent: 60 },
  { position: 2, percent: 25 },
  { position: 3, percent: 15 }
]);
assert.deepEqual(normalWinnerDistribution(2), []);
assert.deepEqual(calculateNormalWinnerAmountsCents(10000, 3), [6000, 2500, 1500]);

assert.match(payout, /canPreparePrizePool:\s*ownerAccount/);
assert.match(payout, /canPreparePaidEntry:\s*paidCreatorFeatures/);
assert.match(payout, /canPrepareSponsorReady:\s*ownerAccount && access\.canCreateSponsoredChallenges/);
assert.match(payout, /canPreparePaidVotes:\s*paidCreatorFeatures/);
assert.match(planAccess, /creatorPrizeFundingConfirmed !== true/);
assert.match(createRoute, /CREATOR_PRIZE_FUNDING_REQUIRED/);
assert.match(createRoute, /creatorPrizeFundingConfirmed:\s*false/);
assert.match(publishRoute, /confirmedCreatorFundingCents\s*>=\s*requiredCreatorFundingCents/);
assert.match(publishRoute, /confirmedCreatorFundingCents\s*>=\s*configuredPrizeCents/);
assert.match(settlement, /normalWinnerDistribution\(placementCount\)/);
assert.match(proposal, /normalizeWinnerProposalWinners\(proposal\.winners, challenge\)/);
assert.match(payout, /normalizeChallengeDate\(challenge\.votingStartsAt \?\? challenge\.votingStartAt, "start"\)/);
assert.match(payout, /now\.getTime\(\) >= votingStartsAt\.getTime\(\)/);

console.log("PASS Phase 3 deterministic allocation and authoritative contract checks");
