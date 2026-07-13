import assert from "node:assert/strict";
import { appendUploadFileName, classifyStorageError, formatUploadBytes, mediaErrorMessage, sanitizeFileName, validateMediaFile } from "../lib/media-upload.ts";

const image = { name: "banner.png", type: "image/png", size: 1024 };
const video = { name: "clip.mp4", type: "video/mp4", size: 1024 };

assert.equal(validateMediaFile(image, "image").ok, true, "valid image should pass");
assert.equal(validateMediaFile(video, "video").ok, true, "valid video should pass");

const unsupported = validateMediaFile({ name: "script.exe", type: "application/x-msdownload", size: 10 }, "media");
assert.equal(unsupported.ok, false, "unsupported file type should fail");
if (!unsupported.ok) assert.equal(unsupported.code, "unsupported_format");

const oversized = validateMediaFile({ name: "large.png", type: "image/png", size: 16 * 1024 * 1024 }, "image");
assert.equal(oversized.ok, false, "oversized image should fail");
if (!oversized.ok) assert.equal(oversized.code, "file_too_large");

assert.equal(sanitizeFileName("bad path/../logo ?.png"), "bad_path_.._logo_.png", "file name should be sanitized predictably");
assert.equal(appendUploadFileName("challenges/drafts/user 1/banner", "bad file.png", 123), "challenges/drafts/user_1/banner/123-bad_file.png", "storage path should be predictable and sanitized");
assert.equal(formatUploadBytes(0), "0 B", "zero byte formatting should be stable");
assert.equal(formatUploadBytes(1536), "1.5 KB", "upload byte formatting should be readable");

assert.equal(classifyStorageError(new Error("Firebase Storage: User does not have permission. (storage/unauthorized) ")).code, "permission_denied");
assert.equal(classifyStorageError({ code: "storage/unauthorized", message: "rules rejected write" }).code, "permission_denied");
assert.equal(classifyStorageError(new Error("Firebase Storage: auth token expired")).code, "expired_auth");
assert.equal(classifyStorageError(new Error("Firebase Storage: network request failed")).code, "network_failure");
assert.equal(classifyStorageError(new Error("Firebase Storage: canceled by user (storage/canceled)")).code, "upload_cancelled");
assert.equal(classifyStorageError(new Error("processing failed")).code, "processing_failed");
assert.equal(mediaErrorMessage("unauthenticated"), "Sign in again before uploading media.");

console.log("media upload validation tests passed");
