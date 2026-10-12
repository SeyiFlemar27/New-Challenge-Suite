import assert from "node:assert/strict";
import { challengeMediaDeliveryUrl, isFirebaseStorageDownloadUrl } from "../lib/server/challenge-media-delivery.ts";
import { publicChallengeFields, publicSubmissionFields } from "../lib/server/public-challenge.ts";

const tokenUrl = "https://firebasestorage.googleapis.com/v0/b/example/o/path%2Fmedia.png?alt=media&token=do-not-leak";
const publicFields = publicChallengeFields({
  visibility: "public",
  coverImagePath: "verified-challenge-media/public/images/cover.png",
  coverImageUrl: tokenUrl,
  challengeImages: [{ id: "img-1", path: "verified-challenge-media/public/images/gallery.png", url: tokenUrl, customSecret: "remove" }],
  challengeVideo: { path: "verified-challenge-media/public/videos/trailer.mp4", url: tokenUrl, customSecret: "remove" }
}, "public");
assert.equal(publicFields.coverImageUrl, challengeMediaDeliveryUrl("verified-challenge-media/public/images/cover.png"));
assert.equal(publicFields.challengeImages[0].url, challengeMediaDeliveryUrl("verified-challenge-media/public/images/gallery.png"));
assert.equal(publicFields.challengeImages[0].customSecret, undefined, "media object serialization keeps only the reviewed media fields");
assert.equal(publicFields.challengeVideo.url, challengeMediaDeliveryUrl("verified-challenge-media/public/videos/trailer.mp4"));
assert.equal(publicFields.challengeVideo.customSecret, undefined, "video serialization keeps only the reviewed media fields");

const legacyPublic = publicChallengeFields({ visibility: "public", coverImageUrl: tokenUrl, challengeImages: [{ url: tokenUrl }] }, "legacy");
assert.equal(legacyPublic.coverImageUrl, undefined, "legacy Firebase bearer URLs are not serialized without an authorized storage path");
assert.equal(legacyPublic.challengeImages.length, 0, "legacy Firebase bearer URLs are not serialized from gallery entries");

const privateFields = publicChallengeFields({ visibility: "private", type: "Private / Exclusive", coverImageUrl: tokenUrl, trailerVideoUrl: tokenUrl, challengeImages: [{ url: tokenUrl }] }, "private");
assert.equal(privateFields.coverImageUrl, undefined, "private records without a stable path do not expose stored token URLs");
assert.equal(privateFields.trailerVideoUrl, undefined, "private trailer token URLs are not serialized");
assert.equal(privateFields.challengeImages.length, 0, "private gallery token URLs are not serialized");

const submission = publicSubmissionFields({ mediaStoragePath: "challenges/ch/submissions/user/images/entry.png", mediaUrl: tokenUrl, thumbnailUrl: tokenUrl });
assert.equal(submission.mediaUrl, challengeMediaDeliveryUrl("challenges/ch/submissions/user/images/entry.png"));
assert.equal(submission.thumbnailUrl, undefined, "Firebase token thumbnails are not serialized");
const privateIdentitySubmission = publicSubmissionFields({ displayName: "Private Person", username: "private-handle", participantName: "Private Legal Name", avatarUrl: "https://example.test/private.png" });
assert.equal(privateIdentitySubmission.displayName, undefined, "public submission projection does not trust cached display names");
assert.equal(privateIdentitySubmission.username, undefined, "public submission projection does not trust cached usernames");
assert.equal(privateIdentitySubmission.participantName, undefined, "public submission projection never exposes legal identity fields");
assert.equal(privateIdentitySubmission.avatarUrl, undefined, "public submission projection does not trust cached profile images");
const legacySubmission = publicSubmissionFields({ mediaUrl: tokenUrl });
assert.equal(legacySubmission.mediaUrl, undefined, "legacy submission token URLs are not serialized without a storage path");
assert.equal(isFirebaseStorageDownloadUrl(tokenUrl), true);
assert.equal(isFirebaseStorageDownloadUrl("https://cdn.example.test/image.png"), false);

console.log("PASS Challenge and submission media serialization: stable authorized URLs replace Firebase download-token URLs.");
