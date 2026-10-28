# Staging pre-provisioning findings and approval plan

20 October 2026. READ-ONLY REVIEW COMPLETE WITH BILLING BLOCKER. This is not provisioning approval or an execution report. Candidate remains `3203f4a42877d70b0b58aaa4ec4243897c5f66e4` on `codex/automatic-publishing-exception-moderation`.

## Independently verified findings

The existing Firebase CLI login was used without switching accounts or exposing credentials. The first sandbox authentication attempt failed; the same read-only script succeeded outside the network sandbox. Its corrected organization GET also succeeded. See `challenge-suite-staging-preprovision-verification-2026-10-20.json` for sanitized API evidence.

- Firebase's `projects:checkProjectId` returned `PROJECT_ID_AVAILABLE` for `challenge-suite-staging` at 17:15 UTC. This is a point-in-time availability result, not a reservation; recheck immediately before approved creation. This is the check used by the installed Firebase CLI, not a speculative inference from a 404.
- Production `challenge-suite`, project number `599920137316`, is ACTIVE with no organization/folder parent. Its project IAM has three user Owner principals; the existing CLI account is one. Other personal email addresses were not exported.
- One ACTIVE organization is visible: `organizations/329774095603`. It is not Production's parent. No organization placement, project-creation permission there or organization-policy compatibility is assumed.
- Production `(default)` Firestore is `STANDARD`, `FIRESTORE_NATIVE`, `nam5`, with `PESSIMISTIC` concurrency. Delete protection and PITR are disabled; no Production setting was changed.
- Production Storage is `challenge-suite.firebasestorage.app`, location `US`, multi-region, class `MULTI_REGIONAL`, with seven-day soft delete. These are metadata reads, not object reads/writes. No reason to repeat the successful synthetic object verification.
- Production billing is enabled and linked to an account ending `CCD8B6`. Direct billing-account inspection returned 403; permission testing returned no requested permissions. Its open state, currency, administrator and ability to fund staging cannot be verified with this login.
- Three billing accounts are listable, ending `E8EECA`, `27BC1B`, `775116`; all are CLOSED and USD-denominated. The caller has association/budget permissions on these closed accounts, which does not make them usable. No open usable billing account is verified. Full account IDs, display names and payment details are omitted.
- Current Vercel Preview metadata still contains no Firebase project/bucket/runtime credential records. Twelve shared Preview/Production records cover Stripe and Sumsub, including provider credentials; values were not printed or copied. They must be isolated before staging acceptance. Production remains deployment `dpl_DyD6caF8diEezVDYUZdxz8cVffo5`, SHA `4e0c5cee1c012361f492fd37a50518194fd909d6`.

No project, database, account, bucket, IAM binding, key, Rules release, index, billing link, Vercel variable or deployment was created or changed. The new local files are proposal/evidence artifacts only.

## Final proposed identifiers and placement

| Item | Proposed value | State |
| --- | --- | --- |
| Project ID | `challenge-suite-staging` | Available at check; not reserved or created |
| Display name | `Challenge Suite Staging` | Proposed |
| Parent | No organization, matching Production | Recommended initial placement; requires approval. Use visible organization only after explicit choice and policy/permission review |
| Billing | An approved OPEN account with association/budget access | BLOCKED; none verified |
| Web app display name | `Challenge Suite Staging Web` | Firebase app ID generated at creation; do not invent it |
| Database | `projects/challenge-suite-staging/databases/(default)` | Proposed Standard, Native, pessimistic, location `nam5` |
| Bucket | `challenge-suite-staging.firebasestorage.app` | Expected new default name, subject to actual Firebase provisioning response; location `US`, class `STANDARD` for a newly created bucket |
| Application identity | `challenge-suite-staging-app@challenge-suite-staging.iam.gserviceaccount.com` | Proposed; no keys created |
| Budget display name | `Challenge Suite Staging monthly` | Proposed project-filtered budget |

Recommend `nam5` Firestore and `US` Storage for closer regional topology parity with Production. A `us-central1` database/bucket is a compatible lower-cost alternative but differs from Production's multi-region resilience and latency topology. Choose locations before creation; do not create the regional alternative implicitly. New buckets use current Storage classes; do not force the legacy `MULTI_REGIONAL` class merely to copy Production metadata. See https://firebase.google.com/docs/firestore/locations and https://firebase.google.com/docs/storage/locations.

## Exact proposed provisioning sequence

All steps below require approval. Billing, private credential handling and placement remain unresolved prerequisites; a general approval cannot substitute for their actual verified values.

1. Recheck ID availability and exact identity, verify selected parent policies and the chosen billing account is OPEN with authorized association access. If the ID becomes unavailable, stop rather than choosing a suffix. Do not reopen a closed account or change Production's billing.
2. Create only `challenge-suite-staging`, chosen parent, with labels `environment=staging`, `application=challenge-suite`. Creator ownership is subject to the platform's normal project-creation behavior; add no extra human Owner/Editor bindings. Confirm resulting project number and IAM before proceeding.
3. Link only the explicitly approved billing account; add Firebase to this project and register one web app. No Analytics, Functions, Hosting, extensions or App Engine app. Enable only required Firebase management, Auth/Identity Toolkit, Firestore, Storage, Security Rules, IAM/service-usage APIs and their documented dependencies in staging. Record any platform-managed service-agent creation; stop on unexpected resource requirements.
4. Initialize a separate email/password Auth user pool. Do not import Production users, custom claims or sessions. Enable no phone/SMS, anonymous, social or third-party identity integration. Authorize only verified branch Preview hostnames and the actual staging auth domain. No wildcard Vercel domains or Production domain. Keep a single Admin within staging only if explicitly approved for the bounded moderation tests.
5. Create one Standard Native `(default)` Firestore database in `nam5`, pessimistic concurrency; recommend delete protection enabled, PITR disabled initially. Start with deny-all client Rules until approved application Rules are validated. No Production data import, backup clone, TTL or database-side triggers.
6. Provision the Firebase default Storage bucket in `US`, class `STANDARD`. Use uniform bucket-level access and IAM public-access prevention enforced to avoid public IAM/ACL grants; Firebase authenticated/public media behavior must still pass actual SDK/API tests. Preserve Rules-based public image access and private-media restrictions. Propose seven-day soft-delete retention, matching Production's retention duration, with its storage cost acknowledged. No automated lifecycle deletion until exact test paths/retention are approved. Configure only exact Preview CORS origins if actual browser uploads/downloads require bucket CORS; no wildcard origin or unreviewed headers/methods.
7. Create one staging application service account and the narrow IAM bindings below. Review platform-created service agents separately. No Cloud Tasks queue, Scheduler, WIF provider, Production trust binding, provider webhook, external alert destination or extra cloud product is included.
8. Validate and publish reviewed staging-only Firestore and Storage Rules and create the listed staging-only indexes additively. Independently retrieve serving sources and wait for indexes READY. Never use the repository's default project alias; it points to Production. Stop if the explicit target is not `challenge-suite-staging`.
9. Configure the approved private staging credential and Preview records below only after successful resource verification. Do not generate a credential as part of project creation without its own explicit approval.
10. Redeploy the preserved candidate to Preview through the existing Git workflow, verify source SHA/READY/branch and actual Firebase linkage, then perform the separately approved bounded acceptance batch. Staging configuration approval does not authorize main push, Production resource changes or Tournament activation.

## Proposed application IAM — no grant executed

Use principal `serviceAccount:challenge-suite-staging-app@challenge-suite-staging.iam.gserviceaccount.com` only:

| Resource | Binding | Exact purpose |
| --- | --- | --- |
| Staging project | `roles/datastore.user` | Application Firestore document operations/transactions in staging; no index/Rules/IAM administration |
| Staging project | Custom role `challengeSuiteStagingAuthRuntime` | Only `firebaseauth.users.get`, `firebaseauth.users.update`, `firebaseauth.users.createSession`, `firebaseauth.users.delete` for existing session/account APIs; synthetic account creation uses the separately approved test operator/signup flow |
| Staging bucket only | Custom role `challengeSuiteStagingMediaRuntime` | Only `storage.buckets.get`, `storage.objects.get`, `storage.objects.list`, `storage.objects.create`, `storage.objects.update`, `storage.objects.delete`; actual media checks, metadata/token revocation, canonical copying and bounded cleanup |
| Staging project only | Firebase Storage service agent gets `roles/firebaserules.firestoreServiceAgent` | Storage Rules already use Firestore documents; principal is `service-<ACTUAL_STAGING_PROJECT_NUMBER>@gcp-sa-firebasestorage.iam.gserviceaccount.com`, resolved after creation |

Custom-role permissions must validate against the actual project before binding; stop rather than broaden on failure. No project-wide Storage Admin, Firebase Admin, Owner/Editor, service-account-token-creator, Production access or service-agent role on the app identity. Test/operator provisioning rights are distinct from runtime rights. Admin SDK bypasses client Rules, so resource IAM and server authorization remain essential. Cross-service guidance: https://firebase.google.com/docs/rules/manage-deploy.

The unchanged release candidate uses a certificate credential. Retain that implementation for acceptance of this exact SHA: separately approve creation of one staging-only key, stored privately in sensitive branch-scoped Vercel records, with an identified custodian and revoke/rotate procedure. Never persist it in reports/repository or send it in chat. If key creation is prohibited by policy or not approved, stop and propose a separately tested keyless code change; that would be a new release candidate, not acceptance of unchanged `3203f4a`.

## Rules and indexes: exact local review artifacts

- Firestore source: `docs/qa/automatic-publishing-20261020/proposed-firestore-private-content-20261020.rules`, file SHA-256 `a7c0d47304c9a1597cf37a0c9cd166c422dae03baea19aa6895263654c58629f`. This includes the three approved protected-read restrictions. Validate independently for staging; do not substitute the root Rules file implicitly.
- Storage source: `storage.rules`, file SHA-256 `5da40adfb842d59b66a32ad77e7ddc54adbbff74a19060e693b7573f48c3774f`. Existing media/participant/private checks remain; staging application must pass them without weakening verification.
- Index artifact: `docs/challenge-suite-staging-proposed-indexes-2026-10-20.json`, SHA-256 `6a47b5de011a5a70c1b0e3ab48ab9d796ae01c4fc03de68745246ba73c0e5073`: exactly 82 composite definitions, zero field overrides, copied from this release candidate's manifest for review. This is a proposed complete staging set for its broader application/approval journeys, not the eight Production additions and not a claim all 82 currently exist in Production. Review this exact artifact before approving creation/costs. Never deploy it to Production. Create missing definitions only, skip equivalent READY/BUILDING definitions, delete none, and use actual query probes.

## Exact Preview configuration scope

Existing Vercel project/team only; target Preview AND branch `codex/automatic-publishing-exception-moderation`. Production/Development and existing shared records remain unchanged. Configure returned actual values, not guessed project numbers/app IDs/API keys:

- Six public Firebase records: `NEXT_PUBLIC_FIREBASE_PROJECT_ID`, `NEXT_PUBLIC_FIREBASE_API_KEY`, `NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN`, `NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET`, `NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID`, `NEXT_PUBLIC_FIREBASE_APP_ID`.
- Server records: `FIREBASE_PROJECT_ID`, `FIREBASE_STORAGE_BUCKET`, `FIREBASE_CLIENT_EMAIL`, `FIREBASE_PRIVATE_KEY`; private key sensitive/server-only. Public and server project/bucket must match the verified staging resource.
- `PRIVATE_INVITE_ENCRYPTION_KEY`: independently generated 32-byte base64 secret, sensitive/server-only, never reused from Production.
- Set false: `TOURNAMENT_ACTIVATION_SCHEDULER_ENABLED`, `TOURNAMENT_MATCH_LIFECYCLE_SCHEDULER_ENABLED`, `TOURNAMENT_ENTRY_PAYMENTS_ENABLED`, `LIVE_EVENT_PAID_CHECKOUT_ENABLED`, `LIVE_EVENT_AUTOMATIC_REFUNDS_ENABLED`, `LIVE_EVENT_CREATOR_FUNDING_ENABLED`, `LIVE_EVENT_SPONSOR_FUNDING_ENABLED`, `LIVE_EVENT_LIFECYCLE_SCHEDULER_ENABLED`, `LIVE_EVENT_EMAIL_DELIVERY_ENABLED`, `NORMAL_EMAIL_DELIVERY_ENABLED`, `TOURNAMENT_EMAIL_DELIVERY_ENABLED`, `NEXT_PUBLIC_SUMSUB_ENABLED`.
- Proposed branch-only empty-string overrides to neutralize inherited provider credentials: `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY`, `SUMSUB_APP_TOKEN`, `SUMSUB_WEBHOOK_SECRET`. Add explicit branch-only empty `SUMSUB_SECRET_KEY`, `SUMSUB_LEVEL_NAME` to prevent inherited/configured provider readiness. Do not inspect or replace shared secret values. Verify Vercel accepts these overrides and runtime treats them as unconfigured before invoking any provider path; stop if safe isolation cannot be proved. Shared Stripe price IDs are inert without credentials and must not be used as sandbox evidence.
- No Production Tournament queue/worker/WIF identity/audience or emulator-host values in staging. Confirm `NEXT_PUBLIC_DISABLE_MEDIA_UPLOADS` is not true; keep the actual mandatory verification. Do not enable test-auth bypasses or silently mark KYC, subscriptions or funding as provider-confirmed.

Expected branch hostname must be obtained from Vercel after verifying its actual branch alias; do not fabricate it. Any CORS/Auth hostname changes are staging-only. Deployment Protection stays enabled; Firebase API authorization remains independently tested.

## Billing proposal and safeguards

Cloud Storage needs Blaze; billing attachment must wait for an approved usable OPEN account. Staging charges may include Firestore requests/index storage, multi-region Storage bytes, retained deleted objects, network egress, budget/monitoring services and additional Vercel builds. No paid provider, SMS, Cloud Tasks or Scheduler workload is included. No promise of a zero bill or guaranteed estimate.

Propose a USD 10 calendar-month staging-only budget, subject to chosen account's currency and owner approval. Display name `Challenge Suite Staging monthly`; filter only the actual staging project number. Thresholds: actual spend 50%, 80%, 100%, plus forecast 100%. Recipient must be an explicitly approved operations/billing mailbox or existing approved notification channel. No recipient has been verified; do not configure delivery until one is selected. An alerts-only budget is not a hard cap: https://docs.cloud.google.com/billing/docs/how-to/budgets. Do not add billing-disable automation, Pub/Sub/Functions or a spend cap affecting Production. Evaluate service-specific quota reductions only after reviewing actual staging quota availability; record exact limits before any changes.

Operational bounds: one run at a time; protected release branch only; at most six synthetic identities, ten challenges and forty media objects per approved batch; ten MiB creator-image limit unchanged; no load testing, real user imports or bulk financial fixture writes. Every created object/document/UID goes in a run manifest; delete only owned exact resources, with object generations checked. Keep agreed audit records and verify no owned test objects remain. Do not delete a whole collection/project/bucket for cleanup. Seven-day soft delete can retain billed bytes after logical deletion.

## Approval inputs and next sequence

Required before provisioning:

1. Approve `challenge-suite-staging`, parent placement (recommended no organization for parity), Standard Native `nam5` database and `US` bucket, exact Rules/index artifacts and scoped IAM above.
2. Select/privately enable access to an OPEN billing account. The account owner can authorize staging association/budget work through the normal Google Cloud workflow; do not send credentials or payment details. Do not reopen the closed accounts automatically or grant broad project roles to solve billing access.
3. Approve the monthly budget amount/currency and actual recipient; approve the staging-only certificate-key option and private custodian, or request the separately scoped keyless alternative.
4. Approve exact branch-only Firebase/provider-isolation records and bounded fixtures (including any staging Admin); resolve any platform policy conflicts before execution.

Then provision only the approved staging scope, record actual identifiers, privately configure secrets, deploy and accept Preview for unchanged SHA `3203f4a42877d70b0b58aaa4ec4243897c5f66e4`. All five builders, private previews, refresh persistence, unauthorized/duplicate publishing, actual stored media/token revocation, exception moderation and Sponsor/Enterprise approvals must pass. Positive funding/paid provider tests remain blocked without an approved sandbox; fixture tests are not provider proof.

After successful applicable gates, continue the already authorized Git-connected application release with scheduling disabled, refresh main/candidate/recovery evidence, verify exact Production SHA/READY/domain and safe smoke tests. Keep registration, both scheduling flags and Scheduler disabled until real worker/recovery, monitoring and payment gates pass and the current activation restriction is lifted. Do not repeat successful Production infrastructure provisioning.

## Current disposition

Project ID availability PASSED at check. Ownership/organization and Production topology reads PASSED. Usable billing account NOT VERIFIED / BLOCKED. Provisioning NOT AUTHORIZED. Preview functional acceptance BLOCKED. Production application NOT UPDATED. No application source or release commit changed during this review.
