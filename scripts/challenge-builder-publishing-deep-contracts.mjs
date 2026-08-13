import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";
import { resolve } from "node:path";

const root = process.cwd();
process.emitWarning = () => {};
const read = (path) => readFileSync(resolve(root, path), "utf8");
const builder = read("components/challenge-builder.tsx");
const publishRoute = read("app/api/challenges/[id]/publish/route.ts");
const createRoute = read("app/api/challenges/route.ts");
const preview = read("app/challenges/create/[draftId]/preview/page.tsx");
const feedback = read("lib/challenge-publish-feedback.ts");
const planAccess = read("lib/plan-access.ts");
const media = read("components/media-display.tsx");
const explore = read("app/explore/page.tsx");
const draftRoute = read("app/api/challenges/drafts/route.ts");
const verification = read("components/verification-guard.tsx");
const tournament = read("components/tournament-builder.tsx");
const hostBuilder = read("components/host/host-competition-wizard.tsx");

const readinessUrl = pathToFileURL(resolve(root, "lib/challenge-publish-readiness.ts")).href;
const { getChallengePublishBlocker, challengeReviewMonetizationLabels } = await import(readinessUrl);
const validValidation = { valid: true, errors: [], missingCount: 0, sectionStatus: {} };
const reportedCreatorState = getChallengePublishBlocker({
  authenticated: true,
  ownsChallenge: true,
  status: "draft",
  planAllowsChallenge: true,
  validation: validValidation,
  mediaMissing: false,
  mediaProcessing: false,
  mediaFailed: false,
  paidEntryRequested: true,
  entryFeeValid: true
});
assert.equal(reportedCreatorState, null, "reported valid Creator state must be ready to submit for review");

const reviewLabels = challengeReviewMonetizationLabels({ monetizationAllowed: true, paidEntryRequested: true, entryFeeValid: true, sponsorReady: true, prizePoolRequested: true, confirmedPrizeFundingCents: 10000 });
assert.deepEqual(reviewLabels, { paidEntry: "Ready", sponsorReady: "Needs review", prizePool: "Uses confirmed funding" });
assert.equal(getChallengePublishBlocker({ authenticated: true, ownsChallenge: true, status: "draft", planAllowsChallenge: true, validation: validValidation, mediaMissing: false, mediaProcessing: false, mediaFailed: false, paidEntryRequested: true, entryFeeValid: false })?.message, "Paid entry setup needs attention.");

assert(publishRoute.includes("getChallengePublishBlocker") && builder.includes("getChallengePublishBlocker") && preview.includes("getChallengePublishBlocker"), "builder, preview, and publish route must share readiness causes");
assert(!publishRoute.includes('"PRIZE_FUNDING_REQUIRED"') && !createRoute.includes('"PRIZE_FUNDING_REQUIRED"'), "operational prize review must not block base challenge submission");
assert(publishRoute.includes("paidEntryEnabled: monetizationIntent.paidEntryRequested") && createRoute.includes("paidEntryEnabled: monetizationIntent.paidEntryRequested"), "nested paid-entry intent must reach the canonical plan gate");
assert(planAccess.match(/creator:[\s\S]*?canCreatePaidChallenges: true/) && planAccess.match(/host:[\s\S]*?canCreatePaidChallenges: true/), "Creator and Host plans must allow paid-entry review submission");
assert(publishRoute.includes('const lifecycleStatus = "pending_review"') && publishRoute.includes("Challenge submitted for review."), "valid publish must submit to pending review");
assert(publishRoute.includes('action: "challenge.publish_failed"') && publishRoute.includes('causeCode: code') && publishRoute.includes('attemptedStatus: "pending_review"'), "safe failed publish audit must capture cause and attempted state");
for (const safeField of ["mediaSummary", "paidEntry", "sponsorReady", "prizePool", "planId", "accountType", "occurredAt"]) assert(publishRoute.includes(safeField), `publish audit must include ${safeField}`);

assert(builder.includes("Ready to submit for review.") && builder.includes("Your challenge will be reviewed before it goes public."), "review state must describe admin review");
assert(!builder.includes("Ready to publish."), "builder must not claim direct-public readiness");
assert(builder.includes('title="Challenge could not be submitted"') && feedback.includes("Publishing failed. Please try again."), "publish failures must not use a generic-only error panel");
for (const message of ["Your session expired. Please sign in again.", "You can't publish this challenge.", "This feature isn't included in your plan.", "Some required details are missing.", "Your challenge timeline needs fixing.", "Please add challenge media before publishing.", "Your media is still processing. Try again shortly.", "Paid entry setup needs attention.", "Sponsor setup needs attention.", "Prize funding needs attention.", "Payment setup is not ready yet.", "This challenge is already under review.", "This challenge has already been submitted."]) assert((feedback + read("lib/challenge-publish-readiness.ts")).includes(message), `missing cause message: ${message}`);
for (const raw of ["CHALLENGE_MEDIA_UNAVAILABLE", "HTTP 503", "FirebaseError", "StripeError"]) assert(!builder.includes(raw), `builder must not expose ${raw}`);
assert(!builder.includes("Something went wrong. Please try again."), "builder publish flow must not use the old generic error");

assert(builder.indexOf("updateChallengeDraft(draftId, { ...payload(false)") < builder.indexOf("publishChallengeDraft(draftId"), "Publish must save the latest draft before submission");
assert(builder.includes('setNotice("Draft saved.")') && !draftRoute.includes("createNotification"), "Save Draft must be toast-only");
assert(builder.includes("router.push(`/challenges/create/${draftId}/preview`)") && !builder.includes("setPreviewOpen"), "Preview must open the full page without publishing");
assert(preview.includes("publishChallengeDraft(draftId") && preview.includes("Back to Editing") && preview.includes("Boolean(publishBlocker)"), "preview must use the same guarded publish contract");

for (const title of ["Overview", "Rules & Eligibility", "Entry & Submission", "Voting & Timeline", "Monetization & Prize Pool", "Media & Branding", "Review & Publish"]) assert(builder.includes(`"${title}"`), `missing dynamic step title ${title}`);
for (const subtitle of ["Set the basic details for your challenge.", "Tell participants who can join and what to follow.", "Define how people enter and what they submit.", "Set your dates, voting window, and winner timing.", "Choose entry fees, prizes, and sponsor readiness.", "Add visuals that make your challenge stand out.", "Check the challenge before submitting it for review."]) assert(builder.includes(subtitle), `missing step subtitle ${subtitle}`);
for (const guide of ["Start With A Clear Challenge", "Set Fair Rules", "Guide Strong Submissions", "Keep Timing Clear", "Plan Rewards Clearly", "Make It Look Ready", "Submit With Confidence"]) assert(builder.includes(guide), `missing guide ${guide}`);
assert(builder.includes("<PageTitle title={steps[step]}") && !builder.includes('<PageTitle title="Overview"'), "main builder title must follow the active step");
assert(builder.includes('"Paid Entry": reviewLabels.paidEntry') && builder.includes('"Sponsor Ready": reviewLabels.sponsorReady') && builder.includes('"Prize Pool": reviewLabels.prizePool'), "review labels must use normalized user-facing states");

for (const phrase of ["Existing server validation", "Provider verified record", "Media URL and storage path", "Storage path saved", "Unsupported premium fields stay locked", "Preview without saving records"]) assert(!builder.includes(phrase), `technical builder copy remains: ${phrase}`);
assert(!publishRoute.includes("KYC_REQUIRED") && !builder.includes("KYC_REQUIRED"), "KYC must not block challenge publishing");

assert(tournament.includes("readiness.ready") && tournament.includes('saveDraft("pending_review")'), "tournament submission must retain readiness gating");
assert(hostBuilder.includes("const problem = validate()") && hostBuilder.includes("createChallenge(payload(publish))"), "private/live host builders must validate before using the canonical create API");
assert(media.indexOf("videoUrl ? <div") < media.indexOf("imageUrls.length ? <div"), "challenge media must remain video-first");
assert(media.includes("controls") && media.includes("playsInline") && !media.includes("autoPlay"), "public video must remain user-controlled and inline");
assert(explore.includes("<Play") && explore.includes("muted") && explore.includes("playsInline"), "Explore must retain a safe video preview indicator");
assert(!draftRoute.includes("createNotification") && builder.includes('setNotice("Draft saved.")'), "draft autosave must not create bell noise");
assert(!verification.includes("Restoring your session") && !verification.includes("Checking session") && !verification.includes("Rehydrating auth"), "technical session loading copy must remain removed");

console.log("PASS challenge-builder-publishing-deep-contracts.mjs");
