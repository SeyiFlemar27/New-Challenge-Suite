import assert from "node:assert/strict";
import { normalBasePrizeCents } from "../lib/normal-base-prize-policy.ts";
import { getNormalChallengeReadiness } from "../lib/normal-challenge-readiness.ts";
import { validateChallengeForPublish } from "../lib/server/challenge-validation.ts";

let count = 0;
for (const [input, expected] of [[undefined, 0], [null, 0], ["", 0], [0, 0], ["0.00", 0], [5, 500], ["5.01", 501], [4.99, null], [-1, null], [0.001, null], [5.001, null], [true, null], [NaN, null], [Infinity, null]]) {
  assert.equal(normalBasePrizeCents(input), expected); count++;
}
const challenge = { builderVersion: "normal_v3", challengeType: "normal", prizeType: "money", prizeValue: 0, numberOfWinners: 3, winnerSplits: [60, 25, 15], winnerPrizeAmountsCents: [0, 0, 0], submissionInstructionsList: [] };
for (const issues of [getNormalChallengeReadiness(challenge).issues, validateChallengeForPublish(challenge).errors]) {
  assert.equal(issues.some(issue => ["submissionInstructionsList", "winnerPrizeAmountsCents", "prizeValue"].includes(issue.field)), false); count++;
}
assert.ok(getNormalChallengeReadiness({ ...challenge, prizeValue: 4.99 }).issues.some(issue => issue.code === "BASE_PRIZE_INVALID")); count++;
assert.ok(getNormalChallengeReadiness({ ...challenge, builderVersion: "normal_v2" }).issues.some(issue => issue.code === "PRIZE_AMOUNTS_INVALID")); count++;
console.log(`Normal Base Prize policy: ${count} assertions passed.`);
