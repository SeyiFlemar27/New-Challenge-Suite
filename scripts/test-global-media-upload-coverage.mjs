import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
const root = process.cwd();
const read = (file) => readFileSync(join(root, file), "utf8");
const exists = (file) => existsSync(join(root, file));

const uploadField = read("components/media-upload-field.tsx");
const mediaUpload = read("lib/media-upload.ts");
const pathHelper = read("lib/media-upload-paths.ts");
const builder = read("components/challenge-builder.tsx");
const hostWizard = read("components/host/host-competition-wizard.tsx");
const joinPage = read("app/challenges/[id]/join/page.tsx");
const submissionsRoute = read("app/api/submissions/route.ts");
const submissionValidation = read("lib/server/submission-validation.ts");
const settingsPage = read("app/settings/[section]/page.tsx");
const settingsRoute = read("app/api/settings/route.ts");
const sponsorOnboarding = read("app/sponsor/onboarding/page.tsx");
const sponsorProfileRoute = read("app/api/sponsor/profile/route.ts");
const sponsorCampaignBuilder = read("components/sponsor/sponsor-campaign-builder.tsx");
const storageRules = exists("storage.rules") ? read("storage.rules") : "";
const stripeWebhook = exists("app/api/stripe/webhook/route.ts") ? read("app/api/stripe/webhook/route.ts") : "";
const withdrawalsRoute = exists("app/api/withdrawals/route.ts") ? read("app/api/withdrawals/route.ts") : "";

assert(pathHelper.includes("challenges/drafts") && pathHelper.includes("userId") && pathHelper.includes("folder"), "challenge draft path helper should be owner and folder scoped.");
assert(pathHelper.includes("return joinStoragePath(\"challenges\", challengeId, \"submissions\", userId, folder);"), "submission path helper should include challenge id, user id, and media folder.");
assert(pathHelper.includes("return \"images\"") && pathHelper.includes("return \"videos\""), "submission folders should map image/video media types explicitly.");
assert(pathHelper.includes("return joinStoragePath(\"users\", userId, \"profile\", folder);"), "profile path helper should be owner scoped.");
assert(pathHelper.includes("return joinStoragePath(\"sponsors\", userId, folder);"), "sponsor path helper should be owner scoped.");
assert(pathHelper.includes("return joinStoragePath(\"sponsors\", userId, \"campaigns\", campaignId, folder);"), "sponsor campaign path helper should be campaign scoped.");
assert(pathHelper.includes("submissions: \"challenges/{challengeId}/submissions/{userId}/{folder}/{fileName}\""), "rules baseline should document participant submission path.");

assert(mediaUpload.includes("application/pdf"), "document uploads must include PDF support.");
assert(mediaUpload.includes("application/vnd.openxmlformats-officedocument.wordprocessingml.document"), "document uploads must include DOCX support.");
assert(mediaUpload.includes("if (kind === \"document\") return documentTypes.join(\",\");"), "document accept list should be document-only.");
assert(mediaUpload.includes("kind === \"video\" ? 250 : 15"), "video uploads should default to 250MB.");
assert(mediaUpload.includes("? 250 : 15"), "image and document uploads should default to 15MB.");
assert(mediaUpload.includes("kind === \"document\" ? documentOk"), "valid documents should pass document validation only for document fields.");

assert(uploadField.includes("Replace"), "shared upload field must support replacing existing media.");
assert(uploadField.includes("Remove"), "shared upload field must support remove/clear where used.");
assert(uploadField.includes("Retry Upload"), "shared upload field must support retry after failure.");
assert(uploadField.includes("Upload complete. Media URL and storage path are ready to save."), "shared upload field must not mark success before URL/path are available.");
assert(uploadField.includes("onChange(downloadUrl, { path, fileName: file.name, contentType: file.type, size: file.size })"), "shared upload field must persist safe metadata.");
assert(uploadField.includes("kind === \"document\""), "shared upload field must handle document UI safely.");
assert(!/placeholder uploaded|mock media|fake upload|storage\.example|blob:/.test(uploadField), "shared upload field must not use fake uploaded media.");

assert(builder.includes("challengeDraftMediaPath(userId, \"banner\")"), "challenge cover upload should use shared draft banner path.");
assert(builder.includes("challengeDraftMediaPath(userId, \"gallery\")"), "challenge gallery uploads should use shared draft gallery path.");
assert(builder.includes("challengeDraftMediaPath(userId, \"video\")"), "challenge trailer upload should use shared draft video path.");
assert(builder.includes("challengeDraftMediaPath(userId, \"documents\")"), "challenge document uploads should use shared draft document path.");
assert(builder.includes("kind=\"document\""), "challenge documents should use the shared document upload field.");
assert(builder.includes("documentUrls") && builder.includes("documentPaths"), "challenge payload should include optional real document references.");
assert(hostWizard.includes("challengeDraftMediaPath(userId, \"banner\")"), "host cover uploads should use shared draft path.");
assert(hostWizard.includes("challengeDraftMediaPath(userId, \"gallery\")"), "host gallery/promo uploads should use shared draft path.");
assert(hostWizard.includes("challengeDraftMediaPath(userId, \"video\")"), "host video uploads should use shared draft path.");

assert(joinPage.includes("SubmissionUploadField"), "participant submission page should use the shared upload field wrapper.");
assert(joinPage.includes("submissionMediaPath(challengeId, userId"), "participant submissions should use shared submission paths.");
assert(joinPage.includes("Participant media submission requires Firebase Storage"), "participant submissions should not fake storage-disabled uploads.");
assert(joinPage.includes("Please wait for your media upload to finish."), "participant submissions should block while upload is active.");
assert(joinPage.includes("Please retry the failed media upload before submitting."), "participant submissions should fail closed after upload errors.");
assert(!joinPage.includes("uploadBytesResumable"), "participant join page should not duplicate Firebase upload logic.");
assert(submissionsRoute.includes("expectedSubmissionPrefix"), "submission API must verify the authenticated owner path.");
assert(submissionValidation.includes("Participant media must be uploaded before submitting."), "submission API must reject pending media demo submissions.");
assert(submissionValidation.includes("valid Firebase Storage path"), "submission API must require storage path metadata.");

assert(settingsPage.includes("profileMediaPath(userId, \"avatar\")"), "profile avatar uploads should use shared profile path.");
assert(settingsPage.includes("profileMediaPath(userId, \"banner\")"), "profile banner uploads should use shared profile path.");
assert(settingsRoute.includes("invalidProfileMediaPath"), "settings API must validate profile media owner paths.");
assert(sponsorOnboarding.includes("sponsorMediaPath(auth.user?.uid ?? \"anonymous\", \"logo\")"), "sponsor logo upload should use shared sponsor path.");
assert(sponsorOnboarding.includes("sponsorMediaPath(auth.user?.uid ?? \"anonymous\", \"banner\")"), "sponsor banner upload should use shared sponsor path.");
assert(sponsorOnboarding.includes("Brand media remains pending review"), "sponsor branding must stay pending-review safe.");
assert(sponsorProfileRoute.includes("invalidSponsorMediaPath"), "sponsor API must validate sponsor media owner paths.");
assert(!sponsorCampaignBuilder.includes("MediaUploadField"), "sponsor campaign asset upload UI is not implemented and remains deferred.");

assert(builder.includes("mediaUploadDisabled") && builder.includes("storage_disabled"), "storage-disabled challenge publishing must remain supported.");
assert(uploadField.includes("if (disabled)") && uploadField.includes("No upload request will be attempted"), "disabled upload mode must avoid upload attempts.");
assert(!storageRules.includes("allow read, write: if true;"), "Storage rules must not be opened.");
assert(!stripeWebhook.includes("MediaUploadField") && !stripeWebhook.includes("uploadBytesResumable"), "Stripe/webhook behavior must not change for media coverage.");
assert(withdrawalsRoute.includes("WITHDRAWALS_SETUP_REQUIRED"), "withdrawals must remain setup-safe.");
assert(pathHelper.includes("storageRulesBaseline"), "path helper should document the rules-aligned path map.");

console.log("Global media upload coverage checks passed.");
