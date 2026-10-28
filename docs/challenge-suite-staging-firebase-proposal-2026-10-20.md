# Dedicated Firebase staging proposal — approval required

Prepared 20 October 2026 for candidate `3203f4a42877d70b0b58aaa4ec4243897c5f66e4`.

Status: PROPOSED ONLY. No non-production Firebase project or bucket is approved, provisioned or verified. Functional Vercel Preview acceptance remains BLOCKED. This document supersedes the earlier assumption that an existing approved non-production project could be selected; it does not authorize any execution.

## Purpose and boundaries

Provide an isolated backend for the release branch Preview in the existing Vercel project `challenge-suite` (`prj_RuZ2HwHUfOxCubMH1EfvB4Bkm6RX`, team `team_Aof3F7rzekkBNGBsPb6p9XmO`). Test all five publishing journeys against actual non-production Firebase services, without importing Production users, credentials, content or financial records.

Firebase recommends a separate project for each environment: https://firebase.google.com/docs/projects/dev-workflows/overview-environments.

Production `challenge-suite` and `challenge-suite.firebasestorage.app` must never be staging targets. Keep `.firebaserc` unchanged; it currently defaults to Production. Any future approved command must name and independently assert the staging project explicitly. No `firebase use`, default-target deploy, Production configuration change, main push or resource creation occurs in this proposal.

## Proposed resource scope

| Resource | Proposed outcome | Approval/verification required |
| --- | --- | --- |
| Google Cloud/Firebase project | One dedicated project, display name “Challenge Suite Staging” | Actual globally available project ID is UNASSIGNED; owner, organization/folder and billing account must be selected |
| Firebase web app | One staging web application | Register only inside the approved staging project; retrieve actual public config afterward |
| Authentication | Separate user pool; email/password for controlled testers initially | Approved tester identities and authorized Preview hostnames; no Production user import, phone/SMS or social provider activation |
| Firestore | One `(default)` database using Firebase-compatible native APIs | Edition must be verified against Production and approved for parity before creation; no automatic edition upgrade. Location decision is separate |
| Storage | One Firebase default bucket with private access governed by reviewed Rules | Actual bucket ID UNASSIGNED; record the returned name, not an assumed name |
| Server runtime identity | One dedicated staging application identity, no Production permissions | Review exact principal, resource scopes and permissions before IAM creation; no Owner/Editor or Production WIF reuse |
| Billing controls | Staging-only budget and approved recipients; usage controls where supported | Billing owner, currency, budget and recipients required; no unapproved alert delivery |

Location recommendation: evaluate `us-central1` for both database and bucket to keep the staging services together and align with the existing Tournament queue region. This is a proposal, not a verified Production database location or residency decision. Verify Production database edition/location read-only and obtain the staging location decision before provisioning. Database and bucket locations must be reviewed independently. See https://firebase.google.com/docs/projects/locations.

Cloud Storage for Firebase requires the Blaze billing plan. Actual charges can include database operations/index storage, objects/retained versions, downloads, and Authentication usage. No fixed cost estimate is claimed without workload and regional pricing. An ordinary alerts-only budget does not cap spending. Proposed test limits below bound workload, not billing. See https://firebase.google.com/docs/storage/web/start and https://docs.cloud.google.com/billing/docs/how-to/budgets.

No Cloud Tasks queue, Scheduler job, WIF provider, Hosting site, Functions, Analytics integration, payment webhook or external email service is included in this initial project proposal. Live Tournament scheduler verification remains a separate release gate.

## Rules, indexes and credentials

Start with locked Firestore and Storage access, then publish only reviewed staging Rules after emulator security checks. Use the application's protected server-API access model; preserve the approved challenge/submission/raw-vote direct-read restrictions. Do not assume the local Firestore Rules file equals the serving approved Production candidate: compare their sources and review the exact staging artifact first. Review Storage Rules separately, including Firestore-backed authorization and any required Firebase-managed cross-service permissions; do not grant them implicitly.

Prepare a staging-only index inventory from the release queries and existing reviewed definitions. An empty staging database may require both the existing baseline indexes and the eight recent additions. Review that complete staging set before creating it; the eight additions alone are not proof of complete coverage. Wait for all required indexes to become READY and run query probes. No Production index manifest deployment.

The current `lib/firebase/admin.ts` requires a certificate credential outside demo emulators: `FIREBASE_CLIENT_EMAIL` and `FIREBASE_PRIVATE_KEY`. It does not currently accept a keyless credential merely by configuring Vercel. Two explicit options therefore exist:

1. Privately configure a separately approved staging-only service-account key, after exact IAM and key-creation approval. Never paste, log or commit the key; record only its nonsecret identity and rotation/revocation owner.
2. Propose a separately reviewed keyless authentication change, with staging-specific trust and affected regression tests. This is not implemented or included in the current release candidate.

Do not silently generate a key or promise keyless operation with the unchanged candidate. Deployment Protection complements Firebase authorization; it does not secure directly reachable Firebase APIs by itself. Review public signup/API abuse exposure and authorized domains before opening test access. No blanket permissive Rules or App Check bypass.

## Preview configuration — separate approval after project verification

Add only missing, reviewed records to Preview, scoped to `codex/automatic-publishing-exception-moderation` where supported. Inspect existing records for conflicts, especially shared Preview payment settings; do not overwrite them implicitly. If safe branch-specific overrides cannot isolate an existing shared setting, stop for an exact configuration decision.

Public configuration retrieved from the actual staging web app:

- `NEXT_PUBLIC_FIREBASE_PROJECT_ID`
- `NEXT_PUBLIC_FIREBASE_API_KEY`
- `NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN`
- `NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET`
- `NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID`
- `NEXT_PUBLIC_FIREBASE_APP_ID`

Private/server configuration:

- `FIREBASE_PROJECT_ID`, `FIREBASE_STORAGE_BUCKET` — same verified staging resources as the public config.
- `FIREBASE_CLIENT_EMAIL`, `FIREBASE_PRIVATE_KEY` — only if the approved certificate option is selected; configure privately.
- `PRIVATE_INVITE_ENCRYPTION_KEY` — independent staging-only secret, base64 encoding of 32 random bytes, privately configured.

Both Tournament scheduling flags must be literal `false`. Keep Tournament entry payments, paid Live Event checkout, automatic refunds, creator/sponsor event funding and external email delivery disabled using the existing supported gates. Review all other provider call paths and existing credentials before tests: there is no assumption that these flags disable every Stripe or identity-provider route. Do not exercise provider acceptance, positive cash funding or paid checkout without the approved sandbox. No Production secrets or worker audiences may be inherited by staging. Emulator mode must be off for real staging acceptance.

Authorize only the exact Preview hostnames required for staging Auth; no Production hostname or wildcard trust. Configure a stable branch hostname if available and approved; protect the Preview throughout testing. A new deployment is required for changed build-time public Firebase configuration; verify its exact source SHA and environment before acceptance.

## Proposed bounded acceptance batch — not authorized yet

Submit the concrete fixture/cleanup plan before writes. Suggested first batch: at most 6 synthetic Auth identities, 10 synthetic challenges covering all five variants and both private access methods, and 40 synthetic media objects. One staging-only Admin identity, if needed, must be specifically approved and preserve the single-Admin model within staging; never create another Production Admin or copy its session.

Use a unique run manifest listing every created UID, document path and object generation. Include generated profile, consent, publication, notification, moderation and audit records in the inventory. Prevent broad collection cleanup; preserve audit evidence according to the approved retention decision. Stop if the run would exceed its reviewed scope. Generation-safe deletion applies only to owned test objects. Do not rely solely on a name prefix or TTL for cleanup.

Verify Auth, Firestore and Storage independently, then browser-to-API-to-data behavior: draft/save/restore, mandatory JPEG/PNG/WebP image, optional media blank, ownership/decoding/token revocation, publication persistence, Explore/detail/refresh, private credential isolation and locked previews, duplicate requests, unauthorized attempts, material edits and exception moderation. Verify Sponsor/Enterprise approval boundaries with staging fixtures. Zero-prize publishing is live-testable; positive funding and paid paths remain fixture-only until provider acceptance is approved. Tournament information may publish while registration stays accurately unavailable.

A transport-only synthetic task test does not establish full competition lifecycle or paid readiness. Neither staging success nor existing emulator success replaces Production runtime media, worker OIDC, delivery/retry/recovery and monitoring checks.

## Exact approval and execution sequence

1. Approve project ownership, desired actual project ID, billing account, budget/recipients, database edition and both locations. Verify name availability; stop on collisions rather than choosing another ID automatically.
2. Review the explicit resource/API/IAM/credential plan against those choices. Separately authorize project, billing, Auth, database, bucket, web app, Rules/indexes, IAM and any credential creation. No execution command is provided with an invented target.
3. Provision only the approved staging resources. Independently retrieve actual project number, database edition/location, bucket name/location, web app config and IAM; prove no trust or grants to Production. Record nonsecret evidence.
4. Review and separately approve exact Preview-only environment changes and Auth hostnames. Configure secrets privately; do not export them into reports or repository files. Verify existing Production metadata remains unchanged.
5. Approve the bounded fixture/cleanup plan; redeploy Preview from the verified release candidate through the existing workflow. Verify SHA, READY, project linkage and `backendAvailable:true`; execute acceptance and cleanup, recording failures.
6. Only after Preview gates pass, resume the already authorized application release sequence with scheduling disabled, subject to all remaining gates and latest instructions. No main push is performed by staging setup approval.
7. Keep full Tournament activation blocked until actual worker/recovery verification, approved monitoring destination/policies and approved Stripe sandbox evidence pass. The latest instruction forbids flag activation, Scheduler resume and registration during this review.

On staging failure, halt affected tests and preserve evidence. Disable only approved staging access or revoke its dedicated credential through an approved response. Do not delete the project, disable billing, wipe collections or roll back Production automatically. No staging teardown or recurring cost commitment is implied beyond the separately approved scope.

## Current release status

Candidate and recovery snapshot remain preserved. Functional Preview acceptance: BLOCKED. Project ID: NONE APPROVED. Bucket: NONE APPROVED. Resources provisioned by this proposal: zero. Preview changes applied: zero. Production resources changed: zero. Application Production release and Tournament activation: not completed.
