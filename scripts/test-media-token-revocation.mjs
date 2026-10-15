import assert from "node:assert/strict";
import { removeDownloadToken } from "../lib/server/media-verification.ts";
import { MediaVerificationError, mediaVerificationFailure } from "../lib/server/media-verification-errors.ts";
let patches = 0;
const metadata = { firebaseStorageDownloadTokens: "deterministic-test-token", ownerNote: "preserve" };
const file = {
  async getMetadata() { return [{ metadata: { ...metadata } }]; },
  async setMetadata(patch) {
    patches++;
    assert.equal(patch.metadata.firebaseStorageDownloadTokens, null, "GCS merges metadata: explicit null is required");
    for (const [key, value] of Object.entries(patch.metadata)) { if (value === null) delete metadata[key]; else metadata[key] = value; }
  }
};
await removeDownloadToken(file, "coverImagePath");
assert.equal(metadata.firebaseStorageDownloadTokens, undefined);
assert.equal(metadata.ownerNote, "preserve");
await removeDownloadToken(file, "coverImagePath");
assert.equal(patches, 1, "a verified token-free object requires no additional mutation");
await assert.rejects(() => removeDownloadToken({ async getMetadata() { return [{ metadata: { firebaseStorageDownloadTokens: "fixture" } }]; }, async setMetadata() {} }, "coverImagePath"), /MEDIA_DOWNLOAD_TOKEN_COULD_NOT_BE_REMOVED/);
const failure = mediaVerificationFailure(new MediaVerificationError("MEDIA_DOWNLOAD_TOKEN_COULD_NOT_BE_REMOVED", "token_revocation"), "PUB-TESTREF");
assert.equal(failure.status, 503);
assert.equal(failure.code, "MEDIA_VERIFICATION_UNAVAILABLE");
assert.doesNotMatch(failure.message, /replace|reupload/i);
assert.equal(mediaVerificationFailure(new Error("MEDIA_OBJECT_MISSING:coverImagePath"), "PUB-TESTREF").status, 422);
assert.equal(mediaVerificationFailure(new Error("untrusted private/path?token=secret"), "PUB-TESTREF").category, "MEDIA_VERIFICATION_FAILED");
console.log("PASS GCS PATCH token deletion, idempotency, failure detection, and redacted actionable diagnostics");
