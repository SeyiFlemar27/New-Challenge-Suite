import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();
const read = (file) => readFileSync(join(root, file), "utf8");
const exists = (file) => existsSync(join(root, file));

const builder = read("components/challenge-builder.tsx");
const uploadField = read("components/media-upload-field.tsx");
const firebaseClient = read("lib/firebase/client.ts");
const validation = read("lib/server/challenge-validation.ts");
const challengesRoute = read("app/api/challenges/route.ts");
const publicChallenge = read("lib/server/public-challenge.ts");
const challengeDetail = read("app/challenges/[id]/page.tsx");
const domainCards = read("components/domain-cards.tsx");
const myChallenges = read("app/my-challenges/page.tsx");
const storageRules = exists("storage.rules") ? read("storage.rules") : "";
const stripeWebhook = read("app/api/stripe/webhook/route.ts");
const withdrawals = read("app/api/withdrawals/route.ts");

assert(firebaseClient.includes("NEXT_PUBLIC_DISABLE_MEDIA_UPLOADS"), "storage-disabled mode must support a public feature flag.");
assert(firebaseClient.includes("disabled_demo_mode"), "storage-disabled mode must expose a demo-disabled state.");
assert(firebaseClient.includes("disabled_storage_not_configured"), "storage-disabled mode must detect missing storage config.");
assert(firebaseClient.includes("disabled_storage_not_available"), "storage-disabled mode must detect unavailable storage initialization.");
assert(firebaseClient.includes("mediaUploadsDisabled"), "client config status must expose whether media uploads are disabled.");
assert(firebaseClient.includes("normalizeStorageBucket"), "existing storage bucket normalization must be preserved.");

assert(builder.includes("Media uploads are temporarily unavailable while storage is being connected."), "media step must show setup-safe disabled message.");
assert(builder.includes("You can publish this challenge without media for now."), "media step must explain publishing without media.");
assert(builder.includes("Publishing without media. No upload request will be attempted."), "media step must clearly avoid upload attempts.");
assert(builder.includes("mediaUploadDisabled"), "builder must derive storage-disabled mode.");
assert(builder.includes("requiredImageMissing = !mediaUploadDisabled"), "cover image must not be required in disabled mode.");
assert(builder.includes("mediaUploadStatus: mediaUploadDisabled ? \"storage_disabled\""), "challenge payload must mark storage-disabled media.");
assert(builder.includes("mediaStatus: mediaUploadDisabled ? \"skipped_storage_not_configured\""), "challenge payload must mark skipped media.");
assert(builder.includes("usesPlaceholderMedia: mediaUploadDisabled"), "challenge payload must mark placeholder media use.");
assert(builder.includes("mediaFallbackType: mediaUploadDisabled ? \"challenge_suite_placeholder\""), "challenge payload must use branded placeholder metadata.");
assert(builder.includes("Challenge published successfully without media."), "publish success copy must not claim media upload success.");
assert(!builder.includes("Media uploaded successfully"), "builder must not claim media uploaded in disabled mode.");
assert(!builder.includes("fake upload"), "builder must not fake upload success.");

assert(uploadField.includes("disabled = false"), "upload component must support disabled/setup-safe mode.");
assert(uploadField.includes("if (disabled)"), "upload component must avoid upload attempts when disabled.");
assert(uploadField.includes("Media skipped for now"), "upload cards must use accurate skipped-media copy.");
assert(uploadField.includes("disabled={disabled}"), "file input must be disabled in storage-disabled mode.");
assert(uploadField.includes("status === \"failed\" && !disabled"), "retry controls should be hidden while storage is disabled.");
assert(uploadField.includes("uploadBytesResumable"), "real upload behavior must remain when storage is configured.");
assert(uploadField.includes("getDownloadURL(uploadTask.snapshot.ref)"), "configured uploads must still wait for real download URLs.");

assert(validation.includes("mediaUploadStatus: z.enum([\"required\", \"uploaded\", \"storage_disabled\"])"), "server schema must accept storage-disabled media status.");
assert(validation.includes("canSkipCoverMedia"), "publish validation must have a focused cover-media skip helper.");
assert(validation.includes("NEXT_PUBLIC_DISABLE_MEDIA_UPLOADS"), "server validation must honor the demo-mode flag.");
assert(validation.includes("!coverMediaSkipped"), "server validation must relax only the cover media requirement in disabled mode.");
assert(validation.includes("Upload a challenge banner."), "normal storage-configured media requirement must remain.");

assert(challengesRoute.includes("mediaUploadStatus: body.usesPlaceholderMedia ? \"storage_disabled\""), "API must persist storage-disabled media status.");
assert(challengesRoute.includes("coverImageUrl: body.usesPlaceholderMedia ? null"), "API must not store fake cover URLs.");
assert(challengesRoute.includes("coverImagePath: body.usesPlaceholderMedia ? null"), "API must not store fake storage paths.");
assert(challengesRoute.includes("mediaStorageStatus: body.usesPlaceholderMedia ? \"storage_disabled\""), "API must persist storage-disabled storage status.");
assert(challengesRoute.includes("Challenge published successfully without media."), "API success copy must be accurate.");

assert(publicChallenge.includes("\"usesPlaceholderMedia\""), "public challenge projection must expose placeholder media metadata.");
assert(publicChallenge.includes("\"mediaFallbackType\""), "public challenge projection must expose media fallback type.");
assert(challengeDetail.includes("ChallengeMediaPlaceholder"), "challenge detail must render a branded placeholder without Firebase Storage.");
assert(challengeDetail.includes("Live Challenge"), "challenge detail placeholder should be branded and intentional.");
assert(domainCards.includes("Challenge Suite"), "domain cards must render a branded placeholder.");
assert(myChallenges.includes("Challenge Suite"), "my challenges must render a branded placeholder.");

assert(!/https?:\/\/.*placeholder|blob:|firebase.*fake|storage\.example/.test(builder + challengesRoute), "challenge payload must not include fake, blob, or placeholder media URLs.");
assert(!storageRules.includes("allow read, write: if true;"), "Storage rules must not be opened.");
assert(stripeWebhook.includes("paymentPurpose"), "Stripe webhook should remain purpose-isolated.");
assert(withdrawals.includes("WITHDRAWALS_SETUP_REQUIRED"), "withdrawals must remain setup-safe.");

console.log("Storage-disabled challenge publish checks passed.");
