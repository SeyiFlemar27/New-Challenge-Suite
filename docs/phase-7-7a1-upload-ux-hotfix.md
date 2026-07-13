# Phase 7.7A.1 - Real Upload UX Polish, Replace/Delete Controls, and Failed Upload Debugging

## Scope

This phase polishes the existing media upload foundation rather than rebuilding it. The shared upload component is still used by challenge media, participant-adjacent flows that use the component, sponsor onboarding assets, and profile/settings uploads.

## Upload UX Changes

`components/media-upload-field.tsx` now presents uploads like a production upload field:

- selected file name
- file size
- real Firebase resumable upload percentage
- horizontal progress bar with accessible progress attributes
- simple upload speed label while Firebase reports bytes transferred
- state copy for preparing, uploading, processing, complete, and failed states
- preview remains contained on mobile and desktop
- success badge after completion
- retry, choose another file, replace, and remove controls

Progress is not faked. If Firebase remains at `0%`, the UI says `Preparing upload...` until real `bytesTransferred` data arrives.

## Replace Behavior

The Replace control opens the file picker and uploads the new file through the same resumable Firebase flow. The previous successful form value is not cleared until the replacement upload succeeds. If the replacement upload fails, the previous uploaded media remains in the parent form state and the user sees the mapped failure reason.

## Remove/Delete Behavior

Remove now asks for confirmation when an uploaded media value exists. The field is cleared from the current form, making required uploads incomplete again. No direct Firebase Storage deletion is performed from the client because a safe server-side ownership-checked deletion API does not exist yet.

User copy is explicit:

> Removed from this challenge. Stored file cleanup will be handled by the platform.

A future cleanup API should verify authentication, ownership, path namespace, and file metadata server-side before deleting stored objects.

## Failed Upload Debugging Findings

Likely causes for real upload failures remain environment/rules/path related rather than progress UI related:

1. `NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET` must be present in the browser environment. The component uses `firebaseClientConfigStatus.storageConfigured` and does not print the value.
2. Local `storage.rules` from Phase 7.7A must be reviewed and deployed before production uploads can pass rules.
3. Uploads require an authenticated Firebase user. The component logs only `authUserPresent: true/false`.
4. Upload paths must match rules exactly. This phase aligned challenge promo media paths with local rules and publish validation.
5. Browser CORS can still block upload/download behavior if Firebase Storage CORS is not configured for the deployed domain.
6. Bucket name must match the active Firebase project. Do not guess between legacy `appspot.com` and newer `firebasestorage.app` bucket names.

Safe client debug logging now records only:

- upload event name
- component label
- storage configured true/false
- env var name, not value
- auth user present true/false
- upload path
- content type and size
- mapped error code

No secrets, tokens, credentials, or env values are logged.

## Storage Path and Rules Notes

Current draft upload paths remain:

- `challenges/drafts/{ownerUid}/banner/{fileName}`
- `challenges/drafts/{ownerUid}/promo-flyer/{fileName}`
- `challenges/drafts/{ownerUid}/trailers/{fileName}`
- `challenges/drafts/{ownerUid}/promo-video/{fileName}`
- `challenges/host-drafts/{ownerUid}/banner/{fileName}`
- `challenges/hybrid-drafts/{ownerUid}/banner/{fileName}`
- `live-events/drafts/{ownerUid}/media/{folder}/{fileName}`
- `live-events/hybrid-drafts/{ownerUid}/media/{folder}/{fileName}`

Local `storage.rules` were updated to include challenge promo flyer and promo video namespaces for existing challenge records:

- `challenges/{challengeId}/promo-flyer/{fileName}`
- `challenges/{challengeId}/promo-video/{fileName}`

Rules were not published.

`validateChallengeForPublish` now accepts the live-event draft media namespaces used by Host/Hybrid builders so optional promo media does not fail publish validation solely because it came from a draft media path.

## Required Upload / Publish Validation

Phase 7.7B behavior remains intact:

- Save Draft remains available even when upload is incomplete or failed.
- Publish remains blocked when required banner upload is incomplete or failed.
- Removing required media clears the parent form field and makes publish validation fail again.
- The publish checklist still reports `Upload a challenge banner` when the banner URL/path is missing.

## Tests

Updated `scripts/test-media-upload-validation.mjs` to cover:

- unsupported media type rejection
- oversized media rejection
- path sanitization
- readable byte formatting
- Firebase error object code mapping
- existing human-readable error mapping

`node scripts/test-challenge-publish-validation.mjs` should also continue passing to confirm required upload removal/missing banner behavior remains blocked at publish time.

## Manual QA Steps

1. Sign in as a creator or host.
2. Open `/challenges/create`.
3. Select an allowed image for the cover field.
4. Confirm the card shows file name, file size, progress bar, percentage, and current state.
5. Confirm success state shows preview, upload complete copy, Replace, and Remove.
6. Click Replace, select a second valid image, and confirm the original form value is not cleared unless replacement succeeds.
7. Click Remove, confirm the dialog, and verify the publish checklist returns to `Upload a challenge banner`.
8. Try an unsupported file and verify the mapped unsupported-format message.
9. Try an oversized image and verify the max-size message.
10. Test sponsor onboarding and profile settings upload fields for the same shared behavior.
11. In browser devtools, confirm safe debug logs do not include env values, tokens, or credentials.

## Environment / Firebase / Vercel Actions Still Required

- Confirm `NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET` exists in Vercel for every deployed environment.
- Confirm the bucket name exactly matches Firebase Console Storage.
- Deploy reviewed `storage.rules` only after approval.
- Configure Firebase Storage CORS for the production domain if browser upload/download requests fail due to CORS.
- Verify authenticated Firebase users have claims/profile state expected by Storage rules.

## Remaining Blockers

- No safe server-side delete-from-storage API exists yet, so Remove clears form state only.
- Credentialed browser upload QA is still required against a deployed environment with the correct bucket and published rules.
- Stored draft media is not migrated from draft namespace into final challenge namespace during publish; publish validation intentionally accepts owner draft namespaces until a finalize/migration step exists.
