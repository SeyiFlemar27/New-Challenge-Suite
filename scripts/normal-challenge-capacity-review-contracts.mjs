import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";

const read = (path) => readFileSync(path, "utf8");
const capacity = await import(pathToFileURL("lib/normal-challenge-capacity.ts"));
const foundation = await import(pathToFileURL("lib/challenge-builder-foundation.ts"));
const builder = read("components/normal-challenge-builder.tsx");
const steps = read("components/normal-challenge-builder-steps.tsx");
const model = read("lib/normal-challenge-builder-model.ts");
const readiness = read("lib/normal-challenge-readiness.ts");
const capacitySource = read("lib/normal-challenge-capacity.ts");
const schema = read("lib/server/challenge-validation.ts");
const publishRoute = read("app/api/challenges/[id]/publish/route.ts");

for (const value of ["", 0, 2, 50]) {
  assert.equal(capacity.normalChallengeCapacityError(value), null, `${String(value)} should be a valid Normal capacity`);
}
for (const value of [1, -1, 3.5, 51, "not-a-number", null]) {
  assert.equal(capacity.normalChallengeCapacityError(value), capacity.NORMAL_CHALLENGE_CAPACITY_ERROR, `${String(value)} should be rejected`);
}
assert.equal(capacity.normalizeNormalChallengeCapacity(""), 0, "blank capacity must normalize to unlimited");
assert.equal(capacity.normalizeNormalChallengeCapacity(0), 0, "zero capacity must stay unlimited");

assert.match(readiness, /normalChallengeCapacityError\(challenge\.maxParticipants\)/);
assert.match(schema, /normalChallengeCapacityError\(value\.maxParticipants\)/);
assert.match(schema, /normalChallenge[\s\S]*value\.maxParticipants < 2/);
assert.match(schema, /z\.coerce\.number\(\)\.int\(\)\.min\(0\)\.max\(50\)/);
assert.match(schema, /Participant capacity must be at least 2\./);
assert.ok(publishRoute.includes('const lifecycleStatus = "pending_review"'), "valid Normal submissions must still enter pending_review");

const ready = { ready: true, nextRequiredStep: 0 };
const incomplete = { ready: false, nextRequiredStep: 3 };
for (const value of [6, "6"]) assert.equal(foundation.normalizeNormalChallengeStep(value, ready), 6);
for (const value of ["Review", Number.NaN, -1, 99, 3.5]) {
  assert.equal(foundation.normalizeNormalChallengeStep(value, ready), 7, `completed draft ${String(value)} must land on Publish`);
  assert.equal(foundation.normalizeNormalChallengeStep(value, incomplete), 3, `incomplete draft ${String(value)} must land on its next required step`);
}

assert.match(model, /normalizeNormalChallengeCapacity\(form\.maxParticipants\)/);
assert.match(builder, /normalizeNormalChallengeStep\(challenge\.builderCurrentStep \?\? challenge\.creationStep \?\? 1, loadedReadiness\)/);
assert.match(steps, /if \(step === 6\) return <Review/);
assert.match(builder, /step === NORMAL_CHALLENGE_MAX_STEP[\s\S]*Submit for Review/);
assert.match(builder, /normalChallengeSubmitIssue\(result\.details\)/);
assert.match(builder, /Some required details need attention\./);
assert.match(steps, /No fixed capacity\./);
assert.match(steps, /Limited to \$\{form\.maxParticipants/);
assert.match(steps, /with a waitlist/);
assert.doesNotMatch(builder, /Too small: expected number to be >=2/);
assert.match(capacitySource, /Set capacity to at least 2, or leave it blank for no fixed capacity\./);

const reportedState = {
  challengeType: "normal",
  visibility: "public",
  hideParticipantList: true,
  maxParticipants: capacity.normalizeNormalChallengeCapacity(""),
  paidEntryRequested: false,
  eligibleCountry: "",
  minimumAge: 18,
  maximumAge: 24,
  competitionFormat: "Public Voting",
  hideVoteTotals: false,
  hideRankings: false,
  numberOfWinners: 3,
  prizeValue: 1000,
  prizeCurrency: "USD",
  coverImagePath: "challenges/drafts/user/banner/cover.jpg"
};
assert.equal(reportedState.maxParticipants, 0);
assert.equal(capacity.normalChallengeCapacityError(reportedState.maxParticipants), null);

console.log("PASS normal-challenge-capacity-review-contracts.mjs");
