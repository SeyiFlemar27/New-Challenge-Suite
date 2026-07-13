# Phase 7.7A - Media Upload Root-Cause Audit and Fix

## Scope

This phase audited and fixed the connected media upload paths for Challenge Suite without reading `.env.local`, printing secrets, publishing Firebase rules, or changing unrelated money/KYC/sponsor systems.

Audited upload areas:

- Challenge banner / cover upload
- Promotional flyer and trailer upload
- Participant submission upload
- Sponsor onboarding brand asset uploads
- Profile avatar and cover uploads
- Sponsor asset library foundation

## Root Cause Found

The upload issue was not a single UI bug. The failure path had three related causes:

1. **Storage bucket configuration was not fail-fast on the client.**
   The Firebase client initialized Storage whenever the app had an API key and project ID, even if `NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET` was missing. That can create an implicit/default bucket target that does not match the intended Firebase Storage bucket.

2. **Active upload paths did not match the desired production path model.**
   The UI used legacy namespaces such as `challengeMedia`, `eventMedia`, `sponsorMedia`, `profileMedia`, and top-level `submissions`. The requested production model is based on predictable namespaces such as `challenges`, `live-events`, `users`, and `sponsors`.

3. **Upload metadata was incomplete.**
   Some flows saved only a download URL. They did not consistently persist the Storage path needed for audit, cleanup, moderation, retry/debugging, or future server-side ownership checks.

A related operational blocker remains: `.firebaserc` is absent, so Firebase deploys must use an explicit project target. Local `storage.rules` was updated but not published.

## Storage Config Findings

Client-side Firebase config now treats Storage as configured only when these public variables are present:

- `NEXT_PUBLIC_FIREBASE_API_KEY`
- `NEXT_PUBLIC_FIREBASE_PROJECT_ID`
- `NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET`

The client now exposes a safe config-status object containing only booleans and env variable names, not values.

Server-side Firebase Admin still requires the existing private Admin variables for server APIs, plus one of:

- `FIREBASE_STORAGE_BUCKET`
- `NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET`

No secret values were read or printed.

## Storage Rules Findings

`firebase.json` points Storage rules to `storage.rules`.

`.firebaserc` is absent.

Local `storage.rules` now matches the new upload path model:

- `challenges/drafts/{userId}/{folder}/{fileName}`
- `challenges/host-drafts/{userId}/{folder}/{fileName}`
- `challenges/hybrid-drafts/{userId}/{folder}/{fileName}`
- `challenges/{challengeId}/banner/{fileName}`
- `challenges/{challengeId}/trailers/{fileName}`
- `challenges/{challengeId}/submissions/{userId}/{fileName}`
- `live-events/drafts/{userId}/media/{folder}/{fileName}`
- `live-events/hybrid-drafts/{userId}/media/{folder}/{fileName}`
- `live-events/{eventId}/media/{fileName}`
- `users/{userId}/profile/{folder}/{fileName}`
- `sponsors/{sponsorId}/assets/{folder}/{fileName}`

Rules restrict writes by authentication, owner path, admin status, MIME type, and size. Unknown paths remain fail-closed.

Rules were **not published**. Required later command should explicitly target the intended Firebase project.

## Code Fixes Made

### Shared upload helper

Added `lib/media-upload.ts` for:

- accepted MIME types
- default size limits
- immediate file validation
- filename/path sanitization
- predictable Storage path generation
- Storage error classification
- user-safe error messages

### Shared upload component

Updated `components/media-upload-field.tsx` to:

- require authenticated user before upload
- fail clearly when Storage is not configured
- validate file type and size before upload
- show local preview immediately
- use resumable upload progress
- expose stages: `idle`, `preparing`, `uploading`, `processing`, `complete`, `failed`
- map permission, expired auth, network, cancelled, timeout, unavailable, and processing failures to user-safe messages
- allow retry without resetting the entire form
- return both `downloadURL` and `storagePath` after success

### Challenge creation uploads

Updated `/challenges/create` to:

- use `challenges/drafts/{userId}/...` paths
- track upload statuses
- block publish while upload is preparing/uploading/processing
- block publish if upload failed
- require cover image before publish
- persist cover/promo/trailer/promo-video Storage paths alongside URLs

### Participant submission upload

Updated `/challenges/[id]/join` to:

- use shared validation
- upload to `challenges/{challengeId}/submissions/{userId}/{fileName}`
- persist `mediaStoragePath` with the submission after success
- show clearer upload errors

Updated `/api/submissions` validation and Firestore write to accept and store `mediaStoragePath`.

### Sponsor brand uploads

Updated sponsor onboarding uploads to:

- use `sponsors/{sponsorId}/assets/{folder}/{fileName}`
- persist logo, alternate logo, square icon, banner, and cover Storage paths through the sponsor profile API

The standalone `/sponsor/assets` library remains metadata-only until a true upload pipeline is intentionally connected. It does not fake upload success.

### Profile uploads

Updated profile/avatar uploads to:

- use `users/{userId}/profile/{folder}/{fileName}`
- persist avatar and cover Storage paths through `/api/settings`

### Host/live/hybrid media

Updated connected host and hybrid builder media paths to the new `challenges/...` and `live-events/...` namespace.

## Environment / Vercel / Firebase Actions Still Required

Required runtime variables must be configured in Vercel and local environments without exposing values:

- `NEXT_PUBLIC_FIREBASE_API_KEY`
- `NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN`
- `NEXT_PUBLIC_FIREBASE_PROJECT_ID`
- `NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET`
- `NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID`
- `NEXT_PUBLIC_FIREBASE_APP_ID`

Server/Admin routes also require the existing Firebase Admin variables.

Firebase Console / CLI actions still required:

1. Confirm the Storage bucket matches `NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET`.
2. Configure Storage CORS if browser uploads fail with CORS/network errors.
3. Deploy local Storage rules only after review:
   `firebase deploy --only storage --project <explicitProjectId>`
4. Do not rely on `.firebaserc`; it is absent.
5. Verify Auth custom claims for admin-only upload paths where relevant.

## Tests Added

Added `scripts/test-media-upload-validation.mjs`.

Covered:

- supported image validation
- supported video validation
- unsupported file type rejection
- oversized image rejection
- predictable sanitized file names and paths
- permission denied error mapping
- expired auth error mapping
- network failure error mapping
- upload cancelled error mapping
- processing failed error mapping
- unauthenticated message mapping

Run with:

```bash
node scripts/test-media-upload-validation.mjs
```

## QA Checklist

- Upload a valid challenge cover image and verify preview/progress/complete state.
- Try publishing a challenge without cover media and confirm publish is blocked.
- Try unsupported file types and oversized files.
- Submit participant image/video media and verify `mediaUrl` and `mediaStoragePath` are stored.
- Try upload while signed out and confirm auth error.
- Try upload with Storage rules not deployed and confirm permission/config error.
- Retry a failed upload without resetting the full form.
- Verify sponsor onboarding logo/cover paths persist.
- Verify profile avatar/cover paths persist.
- Verify private challenge/submission media is not made broadly public by rules.

## Remaining P0 Blockers

- Storage rules must be reviewed and deployed to the correct Firebase project before live browser uploads can succeed.
- Vercel must have the correct `NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET` value configured.
- Firebase Storage CORS may still need console/CLI configuration if browser uploads fail at the network layer.

## Remaining P1 Issues

- Add credentialed browser QA against the deployed Vercel environment.
- Add server-side post-upload verification for high-risk media flows.
- Connect `/sponsor/assets` to a real upload flow when brand asset library storage is intentionally activated.
- Add cleanup/delete flows for replaced media.
- Add moderation queue records for uploaded media where required.

