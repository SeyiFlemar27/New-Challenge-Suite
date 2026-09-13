import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");
const sources = {
  builder: read("components/challenge-builder.tsx"),
  normalBuilder: read("components/normal-challenge-builder.tsx"),
  builderFoundation: read("lib/challenge-builder-foundation.ts"),
  normalConfig: read("lib/normal-challenge-config.ts"),
  publish: read("app/api/challenges/[id]/publish/route.ts"),
  create: read("app/api/challenges/route.ts"),
  feedback: read("lib/challenge-publish-feedback.ts"),
  publishReadiness: read("lib/challenge-publish-readiness.ts"),
  readiness: read("lib/server/provider-readiness.ts"),
  preview: read("app/challenges/create/[draftId]/preview/page.tsx"),
  media: read("components/media-display.tsx") + read("components/challenge-media-carousel.tsx"),
  upload: read("components/media-upload-field.tsx"),
  detail: read("app/challenges/[id]/page.tsx"),
  explore: read("app/explore/page.tsx"),
  enterpriseApi: read("app/api/enterprise-inquiries/route.ts"),
  enterpriseApplications: read("lib/server/enterprise-applications.ts"),
  enterpriseStatus: read("app/enterprise/status/page.tsx"),
  enterprisePage: read("app/enterprise/page.tsx"),
  enterpriseApply: read("app/enterprise/apply/page.tsx"),
  adminApi: read("app/api/admin/operations/route.ts"),
  adminUi: read("components/admin/admin-control-center.tsx"),
  topbar: read("components/authenticated-topbar.tsx"),
  bootstrap: read("app/api/auth/profile/bootstrap/route.ts"),
  guard: read("components/verification-guard.tsx"),
  drafts: read("app/api/challenges/drafts/route.ts")
};

assert.match(sources.readiness, /ALLOW_IMAGELESS_CHALLENGE_PUBLISHING[\s\S]*NEXT_PUBLIC_ALLOW_IMAGELESS_CHALLENGE_PUBLISHING/);
assert.match(sources.publish, /const lifecycleStatus = "pending_review"/);
assert.match(sources.publishReadiness, /ALREADY_UNDER_REVIEW/);
assert.match(sources.publish, /serverError\("Challenge could not be submitted for review/);
assert.doesNotMatch(sources.publish, /if\s*\([^)]*kyc[^)]*\)\s*return\s+fail/i);
assert.match(sources.create, /if \(body\.publish\) lifecycleStatus = "pending_review"/);

for (const message of [
  "Your session expired. Please sign in again.", "You can't publish this challenge.", "This feature isn't included in your plan.",
  "Some required details are missing.", "Your challenge timeline needs fixing.", "Please add challenge media before publishing.",
  "Your media is still processing. Try again shortly.", "Paid entry setup needs attention.", "Prize funding needs attention.",
  "Network issue. Please try again.", "Publishing failed. Please try again."
]) assert.ok(`${sources.feedback}\n${sources.publishReadiness}`.includes(message), `missing publish feedback: ${message}`);
assert.doesNotMatch(sources.builder, /response\.message \|\| "Challenge could not be published/);

for (const title of ["Overview", "Eligibility", "Monetization & Prize Pool", "Media & Branding", "Schedule", "Entry & Submission", "Review", "Publish"]) assert.ok(sources.builderFoundation.includes(`"${title}"`));
assert.match(sources.normalBuilder, /NORMAL_CHALLENGE_(?:STEPS\[step\]|STEP_DEFINITIONS\[step\])/);
assert.match(sources.normalBuilder, /createChallengeDraft\(payload\)/);
assert.match(sources.normalBuilder, /publishChallengeDraft\(id, payload\)/);
assert.match(sources.normalBuilder, /Submit for Review/);
assert.doesNotMatch(sources.normalBuilder, /setPreview\(true\)|function Preview\(|\/preview/);
assert.match(sources.preview, /redirect\(`\/challenges\/create\/\$\{draftId\}`\)/);

assert.match(sources.media, /data-video-first/);
assert.ok(sources.media.indexOf("videoUrl ?") < sources.media.indexOf("cleanImages.map"), "video must render before images");
assert.match(sources.media, /controls muted playsInline preload="metadata"/);
assert.doesNotMatch(sources.media, /autoPlay/);
assert.match(sources.detail, /ChallengeMediaGallery/);
assert.match(sources.explore, /trailerVideoUrl (?:\|\||\?\?) challenge\.promoVideoUrl/);
assert.match(sources.media, /<Play size=\{14\}/);

assert.doesNotMatch(sources.upload, /Media URL and storage path are ready to save|uploaded media URL is saved|saving media reference/);
assert.doesNotMatch(sources.builder, /existing server validation|provider verified|storage path/i);
assert.match(sources.upload, /Upload complete\./);

assert.match(sources.enterpriseApi, /requireRequestUser/);
assert.match(sources.enterpriseApi, /userId: auth\?\.user\.uid/);
assert.match(sources.enterpriseApplications, /requested_changes/);
assert.match(sources.enterpriseStatus, /Pending review/);
assert.match(sources.enterpriseStatus, /Contact Support/);
assert.match(sources.enterpriseStatus, /href="\/contact"/);
assert.doesNotMatch(sources.enterprisePage, /const approved = false/);
assert.match(sources.enterprisePage, /enterpriseAccessStatus/);
assert.match(sources.topbar, /WorkspaceSwitcher/);
assert.doesNotMatch(sources.topbar, /canSwitchEnterpriseRole/);
assert.match(sources.adminUi, /"enterprise-applications": \[\{ action: "approve"/);
assert.match(sources.adminApi, /enterprise: new Set\(\["approve", "reject", "request_info", "add_note"\]\)/);
assert.match(sources.adminApi, /enterpriseAccessStatus: status/);
assert.match(sources.adminApi, /enterprise_application_approved/);
assert.match(sources.adminApi, /writeAuditLog/);
assert.match(sources.bootstrap, /enterpriseAccessStatus/);

assert.match(sources.drafts, /challenge_draft_created/);
assert.match(sources.drafts, /challenge_type_locked/);
assert.doesNotMatch(sources.drafts, /createNotification/);
assert.doesNotMatch(sources.create, /createNotification\([^\n]+Challenge draft saved/);
assert.match(sources.adminApi, /challenge_approved/);
assert.match(sources.adminApi, /challenge_changes_requested/);
assert.doesNotMatch(sources.guard, /Restoring your session|Checking session|Rehydrating auth/);
assert.match(sources.guard, /if \(loading\) return null/);
assert.doesNotMatch(sources.guard, /LoadingGate|aria-label="Loading"/);

for (const source of [sources.builder, sources.normalBuilder, sources.preview, sources.upload, sources.enterprisePage, sources.enterpriseApply, sources.enterpriseStatus]) {
  assert.doesNotMatch(source, /FirebaseError|StripeError|raw JSON|stack trace/);
}
assert.doesNotMatch(sources.preview, /data-public-style-preview|publishChallengeDraft/);
assert.match(sources.enterpriseStatus, /flex flex-wrap/);
assert.match(sources.topbar, /w-\[min\(92vw,330px\)\]/);

console.log(`PASS ${path.basename(process.argv[1])}`);
