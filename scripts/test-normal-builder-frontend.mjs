import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { creatorBasePrizeFunding, getNormalFrontendReadiness, NORMAL_FRONTEND_STEPS, normalFrontendDraftProgress, normalFrontendPayload, normalFrontendSubmitIssue, normalRestoredStep, normalServerStep, normalStepIndex } from "../lib/normal-challenge-frontend.ts";
import { freshNormalChallengeForm, normalChallengeFormFromRecord } from "../lib/normal-challenge-builder-model.ts";
import { getNormalChallengeReadiness } from "../lib/normal-challenge-readiness.ts";

let assertions = 0;
const check = (value, message) => { assertions++; assert.ok(value, message); };
const equal = (actual, expected, message) => { assertions++; assert.deepEqual(actual, expected, message); };
equal(NORMAL_FRONTEND_STEPS.map((step) => step.navLabel), ["Overview", "Monetization & Prize Pool", "Media & Branding", "Schedule", "Entry & Submission", "Review", "Publish"], "seven visible steps");
for (let step = 0; step < 7; step++) equal(normalRestoredStep(normalServerStep(step)), step, "wire mapping round trip");
equal(normalRestoredStep(1), 0, "removed Participation draft resumes safely at Overview");
equal(normalRestoredStep(7), 6, "old Publish becomes new Publish");
equal(normalRestoredStep("invalid"), 0, "invalid saved step never opens a wrong screen");
check(!NORMAL_FRONTEND_STEPS[1].fields.includes("votingSettings") && NORMAL_FRONTEND_STEPS[4].fields.includes("votingSettings"), "voting field belongs to Entry & Submission");
equal(normalFrontendSubmitIssue({ fieldErrors: { "votingSettings.allowPaidVotes": "Invalid configuration" } })?.step, 4, "server voting errors return to the actual control");
equal(normalFrontendSubmitIssue({ fieldErrors: { prizeValue: "Invalid amount" } })?.step, 1, "Base Prize errors have a direct Monetization destination");
equal(normalFrontendSubmitIssue({ fieldErrors: { challengeVideo: "Invalid media" } })?.step, 2, "video errors have a direct Media destination");

const form = freshNormalChallengeForm(Date.parse("2026-10-13T00:00:00Z"));
Object.assign(form, { title: "Frontend regression challenge", category: "Fitness", subcategory: "Strength", description: "A complete description for this isolated frontend fixture.", images: [{ id: "cover", url: "https://example.test/cover.png", path: "users/demo/challenges/cover.png", fileName: "cover.png", contentType: "image/png", size: 100, moderationStatus: "approved" }], confirmations: { accurate: true, rights: true, review: true } });
for (const amount of ["", "0", "0.00"]) {
  form.basePrizeAmount = amount;
  const funding = creatorBasePrizeFunding(amount, null);
  check(funding.satisfied && funding.status === "none", "zero does not invent a funding obligation");
  const readiness = getNormalFrontendReadiness(normalFrontendPayload(form), funding);
  check(readiness.steps[1].complete, "optional zero prize permits monetization progression");
  check(readiness.steps[4].complete, "empty instructions permit submission-step progression");
  check(readiness.ready, "zero Base Prize and empty instructions pass shared readiness");
  check(!readiness.issues.some((issue) => issue.message.includes("backend policy update")), "aligned validation has no obsolete policy blocker");
}
form.basePrizeAmount = "100";
check(!creatorBasePrizeFunding("0.01", { confirmedCreatorPrizeFundingCents: true }).satisfied, "malformed boolean data is not a confirmed financial amount");
check(creatorBasePrizeFunding("100", { confirmedCreatorPrizeFundingCents: "10000" }).satisfied, "valid historical numeric amounts remain compatible");
equal(normalFrontendDraftProgress(normalFrontendPayload(form), 5, 4, { maxUnlockedStep: 5 }), { builderCurrentStep: 6, maxUnlockedStep: 6 }, "empty instructions permit the next API step");
equal(normalFrontendDraftProgress({ ...normalFrontendPayload(form), prizeValue: 0, winnerPrizeAmountsCents: [0] }, 6, 6, { maxUnlockedStep: 2 }), { builderCurrentStep: 3, maxUnlockedStep: 3 }, "zero prize still advances only one persisted step at a time");
check(!creatorBasePrizeFunding("", { monetization: { creatorPrizeFundingRequiredCents: 10000 } }).satisfied, "clearing the form never cancels an existing server-recorded funding obligation");
form.submissionInstructions = ["Keep this saved instruction"];
equal(normalFrontendDraftProgress(normalFrontendPayload(form), 6, 6, { maxUnlockedStep: 5 }), { builderCurrentStep: 6, maxUnlockedStep: 6 }, "completed instructions cannot jump over the API's next allowed position");
equal(normalFrontendDraftProgress(normalFrontendPayload(form), 1, 1, { maxUnlockedStep: 1 }), { builderCurrentStep: 2, maxUnlockedStep: 2 }, "new draft advances past the removed legacy Participation screen");
for (const [record, expected, outstanding] of [
  [null, "unknown", 10000],
  [{ confirmedCreatorPrizeFundingCents: 0, confirmedSponsorFundingCents: 10000 }, "required", 10000],
  [{ confirmedCreatorPrizeFundingCents: 0, monetization: { creatorPrizeFundingStatus: "payment_pending" } }, "pending", 10000],
  [{ confirmedCreatorPrizeFundingCents: 0, monetization: { creatorPrizeFundingStatus: "failed" } }, "failed", 10000],
  [{ confirmedCreatorPrizeFundingCents: 6000 }, "partial", 4000],
  [{ confirmedCreatorPrizeFundingCents: 10000 }, "funded", 0],
]) {
  const funding = creatorBasePrizeFunding(form.basePrizeAmount, record);
  equal(funding.status, expected, "only authoritative creator funding determines the checkpoint");
  equal(funding.outstandingCents, outstanding, "exact outstanding cents");
  equal(getNormalFrontendReadiness(normalFrontendPayload(form), funding).ready, expected === "funded", "unfunded/partial/pending/unknown cannot submit");
}
const historical = { ...normalFrontendPayload(form), maxParticipants: 20, capacityMode: "limited", waitlistEnabled: true, hideParticipantList: true, locationEligibility: "selected", eligibleCountries: ["US"], minimumAge: 18, ageRestrictionMode: "minimum", requiresParticipantApproval: true, participantApprovalMode: "manual", monetization: { sponsorReady: true, sponsorNote: "Preserve historical note", sponsorshipGoal: "old focus", preferredSponsorCategory: "old category", placements: ["Historical sponsor placement"], status: "active_foundation", paymentActive: true, checkoutActive: true, ledgerCreationEnabled: true, prizeReleaseActive: false, payoutReleaseActive: false, enabled: true } };
const restored = normalChallengeFormFromRecord(historical);
equal(restored.submissionInstructions, form.submissionInstructions, "saved instructions remain intact");
const patch = normalFrontendPayload(restored);
check(!Object.hasOwn(patch, "maxParticipants") && !Object.hasOwn(patch.monetization, "sponsorNote"), "autosave omits removed controls rather than clearing stored fields");
const publish = normalFrontendPayload(restored, "existing-draft", historical);
equal(publish.maxParticipants, 20, "existing capacity stays unchanged at publication");
check(!Object.hasOwn(patch, "minimumAge") && !Object.hasOwn(patch, "requiresParticipantApproval"), "form defaults cannot reset stored participation constraints");
equal(publish.minimumAge, 18, "legacy age restrictions are not silently erased");
equal(publish.eligibleCountries, ["US"], "legacy country restrictions are preserved");
check(getNormalFrontendReadiness(publish, creatorBasePrizeFunding("100", { confirmedCreatorPrizeFundingCents: 10000 })).issues.some((issue) => issue.code === "LEGACY_JOINING_POLICY"), "publication cannot silently force a legacy manual joining policy to automatic");
equal(publish.monetization.sponsorNote, "Preserve historical note", "historical sponsor preferences stay unchanged");
equal(publish.monetization.placements, historical.monetization.placements, "schema defaults cannot erase historical sponsor placements at publication");
for (const field of ["enabled", "status", "paymentActive", "checkoutActive", "ledgerCreationEnabled", "prizeReleaseActive", "payoutReleaseActive"]) {
  check(!Object.hasOwn(patch.monetization, field), "draft updates do not fabricate or reset server-controlled financial activation");
  equal(publish.monetization[field], historical.monetization[field], "publication carries the stored flag rather than a form default; server remains authoritative");
}
check(!getNormalChallengeReadiness(normalFrontendPayload(freshNormalChallengeForm())).issues.some((issue) => issue.code === "SUBMISSION_INSTRUCTIONS_REQUIRED"), "shared readiness allows optional Normal V3 instructions");

const ui = readFileSync("components/normal-challenge-builder-steps.tsx", "utf8");
const builder = readFileSync("components/normal-challenge-builder.tsx", "utf8");
check(!/Choose challenge type|TypeCards/.test(builder), "direct Overview entry");
check(!/Participant capacity|Participant list visibility|label="Participation"/.test(ui), "Participation controls removed, not relocated");
check(!/Sponsor support focus|Preferred sponsor category|Sponsor note/.test(ui), "only sponsor checkbox remains");
check(!/Use media you own|712 x 430|1280 x 720/.test(ui), "technical media introduction removed");
check(ui.includes("Submission Instructions (optional)") && !ui.includes("Add at least one instruction"), "optional instructions wording");
check(ui.includes("Free Vote Only") && ui.includes("Free Vote + DoroCoin Voting"), "supported voting labels");
check(ui.includes('disabled={plan === "free" && form.paidVotesEnabled}') && ui.includes("Use Free Vote Only"), "legacy DoroCoin configuration stays visible without enabling new Free-plan paid voting");
check(builder.includes("if (await persist()) router.push") && builder.includes("draftSaveQueue"), "Finish Later waits for serialized save success");
check(builder.includes("guideKeyboardSupport") && builder.includes("fetchChallengeUsage"), "Normal guide and free allowance checks wired");
check(!builder.includes("<main"), "AppShell owns the single main landmark");
console.log(`PASS Normal Builder frontend: ${assertions} assertions; provider and publication transactions require separate verification.`);
