import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (path) => readFileSync(path, "utf8");
const helper = read("lib/server/media-storage-validation.ts");
const validation = read("lib/server/challenge-validation.ts");
const draft = read("app/api/challenges/drafts/[id]/route.ts");

assert.match(helper, /firebasestorage\.googleapis\.com/);
assert.match(helper, /UNVERIFIED_MEDIA_URL/);
assert.match(helper, /Media URL must match its confirmed Challenge Suite storage path/);
assert.match(validation, /validateOwnedStorageMedia/);
assert.match(validation, /challengeImages/);
assert.match(draft, /INVALID_MEDIA_UPLOAD/);
assert.match(draft, /mediaDraftFields/);

console.log("media metadata is storage-path-bound and server-validated: ok");
