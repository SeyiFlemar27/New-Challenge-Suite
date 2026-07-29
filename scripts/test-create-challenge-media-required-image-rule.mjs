import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const builder = readFileSync("components/challenge-builder.tsx", "utf8");
const validation = readFileSync("lib/server/challenge-validation.ts", "utf8");
const upload = readFileSync("components/media-upload-field.tsx", "utf8");

assert(builder.includes("At least one image is required."));
assert(builder.includes('title="Image 1" required={!mediaUploadDisabled}'));
assert(builder.includes('title="Image 2"') && builder.includes('title="Image 3"'));
assert(!builder.includes('title="Image 2" required') && !builder.includes('title="Image 3" required'));
assert(builder.includes("Optional intro video or trailer."));
assert(builder.includes("Add up to 2 optional briefs"));
assert(validation.includes("REQUIRED_BANNER"));
assert(upload.includes("onChange(downloadUrl, { path, fileName: file.name, contentType: file.type, size: file.size })"));
assert(!builder.includes('type="url"'), "the media builder must not add external URL fields.");

console.log("Create challenge required-image and optional-media checks passed.");
