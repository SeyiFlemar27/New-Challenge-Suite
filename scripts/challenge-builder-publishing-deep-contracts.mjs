import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (path) => readFileSync(path, "utf8");
const builderSource = read("components/normal-challenge-builder.tsx");
const builder = builderSource + read("components/normal-challenge-builder-steps.tsx");
const privateBuilder = read("components/challenge-builder.tsx");
const publishRoute = read("app/api/challenges/[id]/publish/route.ts");
const createRoute = read("app/api/challenges/route.ts");
const draftRoute = read("app/api/challenges/drafts/route.ts");
const preview = read("app/challenges/create/[draftId]/preview/page.tsx");
const readiness = read("lib/normal-challenge-readiness.ts");
const feedback = read("lib/challenge-publish-feedback.ts");
const planAccess = read("lib/plan-access.ts");
const media = read("components/media-display.tsx") + read("components/challenge-media-carousel.tsx");
const explore = read("app/explore/page.tsx") + read("components/challenge-media-carousel.tsx");
const verification = read("components/verification-guard.tsx");
const tournament = read("components/tournament-builder.tsx");
const hostBuilder = read("components/host/host-competition-wizard.tsx");

assert(builder.includes("getNormalChallengeReadiness") && publishRoute.includes("getNormalChallengeReadiness"), "builder and submit route must share Normal Challenge readiness");
assert(!publishRoute.includes('"PRIZE_FUNDING_REQUIRED"') && !createRoute.includes('"PRIZE_FUNDING_REQUIRED"'), "operational prize review must not block base challenge submission");
assert(publishRoute.includes("paidEntryEnabled: monetizationIntent.paidEntryRequested") && createRoute.includes("paidEntryEnabled: monetizationIntent.paidEntryRequested"), "paid-entry intent must reach canonical plan gates");
assert(planAccess.match(/creator:[\s\S]*?canCreatePaidChallenges: true/) && planAccess.match(/host:[\s\S]*?canCreatePaidChallenges: true/), "Creator and Host plans must allow paid-entry review submission");
assert(publishRoute.includes('const lifecycleStatus = "pending_review"') && publishRoute.includes("Challenge submitted for review."), "valid submit must enter pending review");
assert(publishRoute.includes('action: "challenge.publish_failed"') && publishRoute.includes("causeCode: code"), "safe blocked-submit audit must retain a cause code");
for (const safeField of ["mediaSummary", "paidEntry", "sponsorReady", "prizePool", "planId", "accountType", "occurredAt"]) assert(publishRoute.includes(safeField), `submit audit must include ${safeField}`);

assert(builder.includes("Ready to submit for review.") && builder.includes("Your challenge will be reviewed before it goes public."), "review state must describe admin review");
assert(!builder.includes("Ready to publish.") && !builder.includes("Publish Challenge"), "normal builder must not claim direct-public readiness");
assert(builder.includes("ApiErrorPanel") && feedback.includes("Publishing failed. Please try again."), "submission failures must retain safe user feedback");
for (const raw of ["CHALLENGE_MEDIA_UNAVAILABLE", "HTTP 503", "FirebaseError", "StripeError"]) assert(!builder.includes(raw), `builder must not expose ${raw}`);

assert(builderSource.indexOf("persist(NORMAL_CHALLENGE_MAX_STEP)") < builderSource.indexOf("publishChallengeDraft(id, payload)"), "Submit for Review must persist latest changes first");
assert(!draftRoute.includes("createNotification") && !builder.includes("Draft saved."), "autosave must remain silent");
assert(preview.includes("redirect(`/challenges/create/${draftId}`)") && !preview.includes("ChallengeMediaGallery"), "creation preview must redirect to editing");
for (const title of ["Overview", "Eligibility", "Monetization & Prize Pool", "Media & Branding", "Schedule", "Entry & Submission", "Review", "Publish"]) assert((builder + read("lib/challenge-builder-foundation.ts")).includes(`"${title}"`), `missing Normal Challenge step ${title}`);
assert(builder.includes("Submit for Review") && builder.includes("Back") && builder.includes('"Continue"'), "builder must expose only sequential navigation actions");
assert(readiness.includes("VOTING_BEFORE_SUBMISSION_CLOSE") && readiness.includes("PRIZE_AMOUNTS_INVALID") && readiness.includes("VIDEO_NOT_CONFIRMED"), "cross-step readiness checks are incomplete");
assert(!publishRoute.includes("KYC_REQUIRED") && !builder.includes("KYC_REQUIRED"), "KYC must not block challenge review submission");

assert(privateBuilder.includes("canCreatePrivateChallenges"), "Private builder entitlement must remain intact");
assert(tournament.includes("readiness.ready") && tournament.includes('saveDraft("pending_review")'), "tournament readiness gating must remain intact");
assert(hostBuilder.includes("const problem = validate()") && hostBuilder.includes("createChallenge(payload(publish))"), "host builders must retain canonical validation");
assert(media.indexOf("...(videoUrl ?") < media.indexOf("...cleanImages.map"), "public challenge media must remain video-first");
assert(explore.includes("<Play") && explore.includes("playsInline"), "Explore video behavior must remain intact");
assert(!verification.includes("Restoring your session") && !verification.includes("Checking session"), "technical session loading copy must remain removed");

console.log("PASS challenge-builder-publishing-deep-contracts.mjs");
