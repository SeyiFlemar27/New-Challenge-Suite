# Preview backend configuration request — not applied

Update: the user confirmed that no non-production project or bucket is approved. The dedicated-resource proposal is [challenge-suite-staging-firebase-proposal-2026-10-20.md](challenge-suite-staging-firebase-proposal-2026-10-20.md). Its separate approval stages now govern the proposed setup; the existing-project selection below is historical context, not permission to reuse Production or create resources.

Release candidate: `3203f4a42877d70b0b58aaa4ec4243897c5f66e4`. Project `challenge-suite`, Vercel project `prj_RuZ2HwHUfOxCubMH1EfvB4Bkm6RX`, team `team_Aof3F7rzekkBNGBsPb6p9XmO`. Its Git-connected Preview is READY at `https://challenge-suite-kmt9ic0gd-seyiflemar27s-projects.vercel.app`.

Protected GET checks reached six page routes successfully using an in-memory short-lived Development OIDC identity. No bypass secret or protection setting was created. The Explore API responds HTTP 200 with `backendAvailable: false`, `reason: backend_not_configured`; this is an unavailable-service fallback, not functional acceptance. The latest smoke checker correctly exits nonzero. Production remains on the previous main commit. No credentials were copied into Preview.

## Required decision and scope

Identify an approved existing non-production Firebase project, Firestore database, Storage bucket and supported test identities. No project, service account, key, database, bucket, Rules, index or IAM grant is created by this request. If any is absent, prepare its exact separate resource request before mutation. Do not infer a project from local emulator IDs or a CLI account.

After those identifiers and ownership are confirmed, inspect current Preview metadata and propose only the missing project-linked records. Stop on conflicts rather than overwriting. Scope all additions to Preview, preferably the release branch where supported; do not change Production or shared existing records.

Expected application configuration names, subject to the selected project's actual configuration:

- NEXT_PUBLIC_FIREBASE_PROJECT_ID
- NEXT_PUBLIC_FIREBASE_API_KEY
- NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN
- NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET
- NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID
- NEXT_PUBLIC_FIREBASE_APP_ID
- FIREBASE_PROJECT_ID
- FIREBASE_STORAGE_BUCKET
- FIREBASE_CLIENT_EMAIL
- FIREBASE_PRIVATE_KEY
- PRIVATE_INVITE_ENCRYPTION_KEY

The current server configuration uses a certificate credential. Use only an already approved non-production credential, configured privately through the approved secret channel; do not request keys in chat, generate/export a new key without approval, or borrow Production credentials. Private invite encryption must use a distinct non-production secret. Presence of a record does not certify its value, project linkage or runtime permission.

Keep TOURNAMENT_ACTIVATION_SCHEDULER_ENABLED and TOURNAMENT_MATCH_LIFECYCLE_SCHEDULER_ENABLED false; do not reuse the Production-only WIF subject from Preview. Paid entry, external payouts, email delivery and paid booking remain disabled until separately verified. Existing Preview Stripe records are not proof of an approved sandbox and must not be overwritten or used for provider tests without the user's approved account identifier.

Verify isolated Auth, Firestore and Storage permissions independently, including Rules compatibility and mandatory media/token handling. Approve bounded synthetic accounts/records/media plus exact cleanup before writes; do not create another live Admin account or bypass the existing Admin model. No production creator records may be used as test fixtures. Run actual Preview publishing/discovery/private-access acceptance and record failures honestly. Repeat affected checks if the candidate changes.

The existing Admin browser session was verified on the current Production application without exporting cookies or credentials. It can initiate the protected probe after a permitted application stage and recent-authentication validation; it does not substitute for Google worker OIDC, WIF, actual delivery, retries or isolated recovery evidence.

This document is a reviewable configuration request, not authorization to apply it or an executed setup. User must identify the approved non-production target before exact values and required changes can be reviewed.
