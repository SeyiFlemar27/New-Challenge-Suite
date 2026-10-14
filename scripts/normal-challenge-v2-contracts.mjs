import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (path) => readFileSync(path, "utf8");
const config = read("lib/normal-challenge-config.ts");
const foundation = read("lib/challenge-builder-foundation.ts");
const model = read("lib/normal-challenge-builder-model.ts");
const readiness = read("lib/normal-challenge-readiness.ts");
const steps = read("components/normal-challenge-builder-steps.tsx");
const shell = read("components/normal-challenge-builder.tsx");
const frame = read("components/challenge-builder-frame.tsx");
const schema = read("lib/server/challenge-validation.ts");
const draft = read("app/api/challenges/drafts/[id]/route.ts");
const publish = read("app/api/challenges/[id]/publish/route.ts");
const status = read("lib/challenge-status.ts");
const media = read("lib/normal-challenge-media.ts");

assert.match(config, /NORMAL_CHALLENGE_BUILDER_VERSION = "normal_v3"/);
assert.match(config, /isNormalChallengeV2[\s\S]*?"normal_v2"/);
assert.match(config, /isNormalChallengeV3/);
for (const label of ["Overview", "Participation", "Monetization & Prize Pool", "Media & Branding", "Schedule", "Entry & Submission", "Review", "Publish"]) assert.ok(foundation.includes(`"${label}"`));
assert.doesNotMatch(foundation, /navLabel: "Eligibility"/);
assert.match(shell, /ChallengeBuilderFrame/);
assert.match(frame, /Step \{currentStep \+ 1\} of \{steps\.length\}/);
assert.match(frame, /Finish Later/);
assert.match(shell, /status === "pending_review"/);
assert.match(shell, /status === "requires_changes"/);
assert.match(shell, /Resubmit for Review/);
assert.match(publish, /reviewRevisionNumber/);
assert.match(publish, /revisionSuffix/);

assert.doesNotMatch(steps, /Short description/);
assert.match(steps, /Full description \*/);
assert.match(steps, /maxLength=\{1200\}/);
assert.match(steps, /1,200 characters/);
assert.match(steps, /Add Rule/);
assert.doesNotMatch(steps, /Participant capacity|Participant list visibility|label="Participation"/);
assert.match(shell, /NORMAL_FRONTEND_STEPS/);
assert.doesNotMatch(steps, /Selected countries|Country access|Age requirement|Minimum age/);
assert.match(model, /legacyShortDescription/);
assert.match(model, /legacyWinnerPrizeAmountsCents/);
assert.match(model, /locationEligibility: preservesLegacyTerms \? form\.locationEligibility : "worldwide"/);

assert.match(steps, /"1 winner"/);
assert.match(steps, /"3 winners"/);
assert.doesNotMatch(steps, /\[\["2", "2 winners"\]\]/);
assert.match(steps, /60% \/ 25% \/ 15%/);
assert.match(readiness, /WINNER_SPLIT_INVALID/);
assert.match(readiness, /PRIZE_ALLOCATION_INVALID/);
assert.match(schema, /INVALID_WINNER_ALLOCATION/);
assert.match(schema, /INVALID_WINNER_SPLITS/);
assert.match(schema, /isNormalChallengeV3\(challenge\) \? 1200 : 2000/);
assert.match(model, /calculateNormalWinnerAmountsCents/);
assert.match(steps, /plan === "free"/);
assert.match(steps, /Your challenge can use free entry and a creator-funded prize/);
assert.doesNotMatch(steps, /Funding \/ Prize Summary/);
assert.match(model, /allowFreeVotes: true/);
assert.doesNotMatch(steps, /65% to the winner bonus pool, 20% to the creator, and 15% to Challenge Suite/);
assert.match(readiness, /CASH_PRIZE_REQUIRED/);
assert.match(model, /winnerPrizeAmountsCents/);
assert.doesNotMatch(steps, /Physical product|Digital product|Special award/);

assert.match(config, /NORMAL_MEDIA_LIMITS/);
assert.match(media, /712 x 430/);
assert.match(media, /4000 x 2416/);
assert.match(media, /1280 x 720/);
assert.match(media, /75 seconds or shorter/);
assert.match(steps, /maxSizeMb=\{5\}/);
assert.match(readiness, /IMAGE_NOT_CONFIRMED/);
assert.match(steps, /Image 1 is the cover/);

assert.match(readiness, /joinClose > submissionOpen/);
assert.match(readiness, /votingOpen < submissionClose/);
assert.match(readiness, /votingClose <= votingOpen/);
assert.match(readiness, /winnerAt < votingClose/);
assert.match(status, /record.builderVersion === "normal_v2" \|\| record.builderVersion === "normal_v3"/);
assert.match(publish, /body.builderVersion === "normal_v2" \|\| body.builderVersion === "normal_v3"/);

assert.match(steps, /Image or Video/);
assert.match(model, /oneEntryPerParticipant: true/);
assert.match(config, /\[12, 24, 48, 72\]/);
const submissionRoute = read("app/api/submissions/[id]/route.ts");
assert.match(submissionRoute, /Only the submission owner can edit this entry/);
assert.match(submissionRoute, /now\.getTime\(\) >= deadlineMs/);
assert.doesNotMatch(submissionRoute, /Fix\s*&\s*Resubmit/i);

assert.match(steps, /Ready to submit for review/);
assert.match(steps, /three confirmations|required|rights to publish|reviewed before it goes public/i);
assert.match(readiness, /CONFIRM_ACCURATE/);
assert.match(readiness, /CONFIRM_RIGHTS/);
assert.match(readiness, /CONFIRM_REVIEW/);
assert.match(shell, /Submit for Review/);
assert.doesNotMatch(shell + steps, />Preview</);
assert.doesNotMatch(shell + steps, /Publish Challenge|Ready to publish/);

assert.match(draft, /NORMAL_CHALLENGE_MAX_STEP/);
assert.match(draft, /"normal_v1", "normal_v2", "normal_v3"/);
assert.match(schema, /challengeImages/);
assert.match(schema, /winnerPrizeAmountsCents/);
assert.match(schema, /publishConfirmations/);
assert.match(model, /normalChallengeFormFromRecord/);
assert.match(model, /legacy-cover/);
assert.match(model, /allowDoroCoinVotes/);

console.log("PASS normal-challenge-builder compatibility and policy contracts");
