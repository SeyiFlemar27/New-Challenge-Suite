# Tournament V3 background processing

## Current implementation boundary

Cloud Tasks dispatches full-capacity activation, versioned V3 match-lifecycle, and team-registration expiry jobs. Firestore remains authoritative for activation eligibility, match status, submission/voting deadlines, moderation state, and bracket dependencies. Lifecycle jobs are derived idempotently from active match state, recheck the exact expected status/deadline before invoking the shared server lifecycle processor, and are harmless when duplicated or stale. Newly opened dependent matches receive their own deadline jobs after activation, result confirmation, deadline processing, moderation updates, or recurring reconciliation.

Do not enable V3 registration in a production runtime until Cloud Tasks and the recurring reconciler are provisioned and verified. The route requires both `TOURNAMENT_ACTIVATION_SCHEDULER_ENABLED=true` and `TOURNAMENT_MATCH_LIFECYCLE_SCHEDULER_ENABLED=true`, complete Cloud Tasks/WIF configuration, and `TOURNAMENT_CLOUD_TASKS_RECONCILER_AUDIENCE`. Missing or malformed configuration fails closed for production registration.

## Required runtime configuration

Configure these as server-only Vercel Production variables after the matching Google Cloud resources and IAM bindings have been reviewed:

- `GOOGLE_CLOUD_PROJECT`
- `GOOGLE_CLOUD_PROJECT_NUMBER`
- `GOOGLE_WORKLOAD_IDENTITY_POOL_ID`
- `GOOGLE_WORKLOAD_IDENTITY_POOL_PROVIDER_ID`
- `CLOUD_TASKS_LOCATION`
- `TOURNAMENT_CLOUD_TASKS_QUEUE`
- `TOURNAMENT_CLOUD_TASKS_WORKER_URL`
- `TOURNAMENT_CLOUD_TASKS_ENQUEUER_SERVICE_ACCOUNT`
- `TOURNAMENT_CLOUD_TASKS_INVOKER_SERVICE_ACCOUNT`
- `TOURNAMENT_CLOUD_TASKS_OIDC_AUDIENCE` (optional; defaults to worker URL)
- `TOURNAMENT_CLOUD_TASKS_RECONCILER_AUDIENCE`
- `TOURNAMENT_ACTIVATION_SCHEDULER_ENABLED` (keep false or unset until verification)
- `TOURNAMENT_MATCH_LIFECYCLE_SCHEDULER_ENABLED` (do not set until all approved match transitions are implemented and verified)

The configured enqueuer and invoker service accounts must belong to the queue project. Use Vercel OIDC with Google Workload Identity Federation; do not put a service-account private key in Vercel. The invoker must be able to call the worker endpoint, and the Cloud Tasks service agent must be allowed to mint the configured OIDC identity under Google's documented requirements.

## Required infrastructure and operations

Before enabling the flag, verify the Cloud Tasks API, queue, Workload Identity pool/provider, least-privilege service accounts, IAM bindings, and task queue retry/dispatch limits in the intended Google Cloud project. Configure a recurring authenticated Cloud Scheduler request to `POST /api/internal/tournament-scheduler` so Firestore jobs committed before a failed enqueue or a terminated application request are rediscovered. The reconciler uses bounded Firestore queries for pending dispatches and expired dispatch leases; deploy the corresponding `tournamentJobs` indexes from `firestore.indexes.json` before activating it.

Cloud Tasks delivery is at least once and scheduled delivery is best effort, not an exact five-second execution guarantee. Workers remain idempotent through job-version, match-state, deadline, and execution-lease checks. A task that remains pending well past its scheduled time is re-versioned and re-enqueued by reconciliation; the previous task then fails its version check. Moderation-pending matches use a persisted five-minute operational recheck interval; this does not extend or shorten the authoritative submission deadline. Admin approval/rejection can create an immediate recheck. Reconciliation latency is determined by the configured Cloud Scheduler interval; late activation starts participant windows from the actual server activation timestamp.

## Release gate still required

This repository does not provision Google Cloud resources or IAM. Durable jobs cover submission deadlines, moderation readiness checks, voting closure, verified result confirmation, newly opened dependent matches, and team-registration expiry. Automatic result confirmation uses a server-created capability tied to a leased, versioned job and the same complete vote-evidence verification and advancement transaction as the authorized handler. Request JSON cannot grant that capability. Missing, inconsistent, or restricted evidence creates a hold; the scheduler never fabricates a winner. Do not describe Tournament V3 as fully unattended or production-ready until the Cloud Tasks queue, retry policy, IAM/WIF, recurring Cloud Scheduler job, required indexes, and full lifecycle browser evidence are verified. No Cloud Tasks queue, service account, IAM grant, Cloud Scheduler job, Firebase index, or Vercel configuration was created by this change.

October 16 read-only Production metadata check: the existing Vercel project lacks Production records for `TOURNAMENT_CLOUD_TASKS_QUEUE`, `TOURNAMENT_CLOUD_TASKS_WORKER_URL`, `TOURNAMENT_CLOUD_TASKS_ENQUEUER_SERVICE_ACCOUNT`, and `TOURNAMENT_CLOUD_TASKS_INVOKER_SERVICE_ACCOUNT`. Presence of the shared project/location/WIF variable names does not verify their values, IAM, queue existence, or dispatch access. No values were printed or changed. Tournament registration and worker authorization must remain fail-closed until the complete configuration is independently verified.
