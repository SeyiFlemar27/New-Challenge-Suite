import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const read = (file) => readFileSync(join(process.cwd(), file), "utf8");
const builder = read("components/challenge-builder.tsx");
const upload = read("components/media-upload-field.tsx");
const readiness = read("lib/server/provider-readiness.ts");
const validation = read("lib/server/challenge-validation.ts");
const publish = read("app/api/challenges/[id]/publish/route.ts");

assert.match(builder, /NEXT_PUBLIC_ALLOW_IMAGELESS_CHALLENGE_PUBLISHING/);
assert.match(builder, /mediaUploadDisabled && imageLessPublishingAllowed/);
assert.match(builder, /mediaUploadStatus: mediaUploadDisabled \? imageLessPublishingAllowed \? "storage_disabled"/);
assert.match(builder, /usesPlaceholderMedia: mediaUploadDisabled && imageLessPublishingAllowed/);
assert.match(readiness, /ALLOW_IMAGELESS_CHALLENGE_PUBLISHING[\s\S]*NEXT_PUBLIC_ALLOW_IMAGELESS_CHALLENGE_PUBLISHING/);
assert.match(publish, /body\.usesPlaceholderMedia[\s\S]*!imageLessChallengePublishingAllowed\(\)/);
assert.match(publish, /CHALLENGE_MEDIA_UNAVAILABLE/);
assert.match(validation, /canSkipCoverMedia/);
assert.match(upload, /if \(disabled\)/);
assert.match(upload, /uploadBytesResumable/);
assert.doesNotMatch(builder + publish, /https?:\/\/.*placeholder|storage\.example|fake upload/i);

console.log("Storage-disabled challenge publish checks passed.");
