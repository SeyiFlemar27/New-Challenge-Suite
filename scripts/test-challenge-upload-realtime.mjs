import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();
const read = (file) => readFileSync(join(root, file), "utf8");
const exists = (file) => existsSync(join(root, file));

const uploadField = read("components/media-upload-field.tsx");
const mediaUpload = read("lib/media-upload.ts");
const builder = read("components/challenge-builder.tsx");
const challengeValidation = read("lib/server/challenge-validation.ts");
const storageRulesChanged = exists("storage.rules") ? read("storage.rules") : "";
const stripeWebhook = exists("app/api/stripe/webhook/route.ts") ? read("app/api/stripe/webhook/route.ts") : "";
const withdrawalsRoute = exists("app/api/withdrawals/route.ts") ? read("app/api/withdrawals/route.ts") : "";

assert(uploadField.includes("uploadBytesResumable"), "upload field must use the real resumable upload API.");
assert(uploadField.includes("uploadTask.on(\"state_changed\""), "upload field must listen to real upload state changes.");
assert(uploadField.includes("snapshot.bytesTransferred / Math.max(snapshot.totalBytes, 1)"), "upload progress must use snapshot bytesTransferred and totalBytes.");
assert(uploadField.includes("setProgress(Math.max(0, Math.min(100, nextProgress)))"), "upload progress must update React state.");
assert(uploadField.includes("getDownloadURL(uploadTask.snapshot.ref)"), "upload completion must resolve a real download URL.");
assert(uploadField.includes("onChange(downloadUrl, { path, fileName: file.name, contentType: file.type, size: file.size })"), "completion must notify parent with URL and storage metadata.");
assert(uploadField.includes("setStatus(\"complete\")"), "completion must set complete status after URL resolution.");
assert(uploadField.includes("setStatus(\"failed\")"), "failed upload state must be explicit.");
assert(uploadField.includes("STORAGE_UPLOAD_STALLED"), "zero-progress stalled uploads must fail closed.");
assert(uploadField.includes("lastBytesTransferredRef.current <= 0"), "stall detection must check whether bytes transferred.");
assert(uploadField.includes("uploadTask.cancel()"), "stalled upload task should be cancelled after fail-closed state.");
assert(uploadField.includes("Starting secure upload..."), "0% active upload copy must avoid implying transfer progress.");
assert(uploadField.includes("Uploading image..."), "progress copy must show active upload percent.");
assert(uploadField.includes("Retry Upload"), "failed uploads must offer retry.");
assert(uploadField.includes("Choose Another File"), "failed uploads must allow another file.");
assert(!/placehold\.co|placeholder uploaded|mock media|fake upload|storage\.example/.test(uploadField), "upload field must not use fake upload URLs or mock media.");

assert(mediaUpload.includes("| \"upload_stalled\""), "media upload error codes must include upload_stalled.");
assert(mediaUpload.includes("Upload did not start transferring. Check your connection and retry."), "stalled uploads must show clear error copy.");
assert(mediaUpload.includes("STORAGE_UPLOAD_STALLED"), "stalled upload classifier must recognize the stall error.");

assert(builder.includes("updateMedia(\"coverImageUrl\", \"coverImagePath\""), "Image 1 must map to coverImageUrl and coverImagePath.");
assert(builder.includes("storagePath={base + \"/banner\"}"), "Image 1 must upload under the banner storage path.");
assert(builder.includes("const requiredImageMissing = !form.coverImageUrl || !form.coverImagePath"), "builder must require both URL and storage path.");
assert(builder.includes("coverImageUrl: form.coverImageUrl"), "save/publish payload must include coverImageUrl.");
assert(builder.includes("coverImagePath: form.coverImagePath"), "save/publish payload must include coverImagePath.");
assert(builder.includes("Please wait for your image upload to finish."), "builder must show upload-in-progress blocker.");
assert(builder.includes("Please retry the failed image upload before publishing."), "builder must show retry failed upload blocker.");
assert(builder.includes("uploadInProgress") && builder.includes("uploadFailed"), "builder must synchronize upload status with publish blocking.");
assert(builder.includes("kind=\"video\"") && builder.includes("Optional intro video or trailer"), "optional video must remain optional.");
assert(builder.includes("Document upload setup required"), "documents must remain optional/setup-safe.");
assert(!builder.includes("placeholder uploaded") && !builder.includes("fake upload"), "builder must not fake uploaded media.");

assert(challengeValidation.includes("if (!coverUrl || !coverPath) makeIssue(errors, \"REQUIRED_BANNER\""), "publish validation must use the same Image 1 cover fields.");
assert(challengeValidation.includes("INVALID_BANNER_STORAGE_PATH"), "publish validation must reject invalid cover storage paths.");

assert(!storageRulesChanged.includes("allow read, write: if true;"), "Storage rules must not be opened by this pass.");
assert(!stripeWebhook.includes("uploadBytesResumable"), "Stripe webhook must not be touched for upload behavior.");
assert(withdrawalsRoute.includes("WITHDRAWALS_SETUP_REQUIRED"), "withdrawals must remain setup-safe.");

console.log("Challenge upload real-time checks passed.");
