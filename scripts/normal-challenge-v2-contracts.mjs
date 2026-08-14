import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (path) => readFileSync(path, "utf8");
const config = read("lib/normal-challenge-config.ts");
const foundation = read("lib/challenge-builder-foundation.ts");
const model = read("lib/normal-challenge-builder-model.ts");
const readiness = read("lib/normal-challenge-readiness.ts");
const steps = read("components/normal-challenge-builder-steps.tsx");
const shell = read("components/normal-challenge-builder.tsx");
const schema = read("lib/server/challenge-validation.ts");
const draft = read("app/api/challenges/drafts/[id]/route.ts");
const publish = read("app/api/challenges/[id]/publish/route.ts");
const status = read("lib/challenge-status.ts");
const media = read("lib/normal-challenge-media.ts");

assert.match(config, /NORMAL_CHALLENGE_BUILDER_VERSION = "normal_v2"/);
for (const label of ["Overview", "Eligibility", "Monetization & Prize Pool", "Media & Branding", "Schedule", "Entry & Submission", "Review", "Publish"]) assert.ok(foundation.includes(`"${label}"`));
assert.match(shell, /Step \{step \+ 1\} of 8/);
assert.match(shell, /Finish Later/);
assert.match(shell, /status === "pending_review"/);
assert.match(shell, /status === "requires_changes"/);
assert.match(shell, /Resubmit for Review/);
assert.match(publish, /reviewRevisionNumber/);
assert.match(publish, /revisionSuffix/);

assert.match(steps, /Short description \*/);
assert.match(steps, /Full description \*/);
assert.match(steps, /Add Rule/);
assert.doesNotMatch(readiness, /RULES_REQUIRED/);
assert.match(steps, /Selected countries/);
assert.match(steps, /No age restriction/);
assert.doesNotMatch(steps, /Maximum age/);
assert.match(steps, /Unlimited/);
assert.match(model, /teamParticipationEnabled: false/);

assert.match(steps, /Free Entry/);
assert.match(steps, /Paid Entry/);
assert.match(steps, /Enable Paid Votes/);
assert.match(model, /allowFreeVotes: true/);
assert.match(steps, /65% to the winner bonus pool, 20% to the creator, and 15% to Challenge Suite/);
assert.match(readiness, /CASH_PRIZE_REQUIRED/);
assert.match(readiness, /winners < 1 \|\| winners > 3/);
assert.match(model, /winnerPrizeAmountsCents/);
assert.doesNotMatch(steps, /Physical product|Digital product|Special award/);

assert.match(config, /imageCount: 3/);
assert.match(media, /712 x 430/);
assert.match(media, /4000 x 2416/);
assert.match(media, /1280 x 720/);
assert.match(media, /75 seconds or shorter/);
assert.match(steps, /maxSizeMb=\{5\}/);
assert.match(steps, /maxSizeMb=\{50\}/);
assert.match(readiness, /IMAGE_NOT_CONFIRMED/);
assert.match(steps, /Image 1 is the public cover/);

assert.match(readiness, /joinClose > submissionOpen/);
assert.match(readiness, /votingOpen < submissionClose/);
assert.match(readiness, /votingClose <= votingOpen/);
assert.match(readiness, /winnerAt < votingClose/);
assert.match(status, /record.builderVersion === "normal_v2"/);
assert.match(publish, /body.builderVersion === "normal_v2"/);

assert.match(steps, /Image or Video/);
assert.match(model, /oneEntryPerParticipant: true/);
assert.match(config, /\[12, 24, 48, 72\]/);
assert.match(steps, /after a creator or admin requests changes/);

assert.match(steps, /Ready to continue to Publish/);
assert.match(steps, /three confirmations|required|rights to publish|reviewed before it goes public/i);
assert.match(readiness, /CONFIRM_ACCURATE/);
assert.match(readiness, /CONFIRM_RIGHTS/);
assert.match(readiness, /CONFIRM_REVIEW/);
assert.match(shell, /Submit for Review/);
assert.doesNotMatch(shell + steps, />Preview</);
assert.doesNotMatch(shell + steps, /Publish Challenge|Ready to publish/);

assert.match(draft, /NORMAL_CHALLENGE_MAX_STEP/);
assert.match(draft, /"normal_v1", "normal_v2"/);
assert.match(schema, /challengeImages/);
assert.match(schema, /winnerPrizeAmountsCents/);
assert.match(schema, /publishConfirmations/);
assert.match(model, /normalChallengeFormFromRecord/);
assert.match(model, /legacy-cover/);
assert.match(model, /allowDoroCoinVotes/);

console.log("PASS normal-challenge-v2-contracts.mjs");
