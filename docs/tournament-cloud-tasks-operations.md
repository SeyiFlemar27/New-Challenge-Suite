# Tournament V3 background processing

## Current implementation boundary

The Cloud Tasks adapter currently dispatches and retries **full-capacity activation jobs**. Firestore remains authoritative for the activation version, five-second eligibility boundary, participants, payments, provisional bracket, and one-time activation. The match lifecycle endpoint still exposes manually initiated processing; match submission deadlines, moderation readiness, voting windows, result verification, and dependent-match advancement are not yet durably scheduled by Cloud Tasks.

Do not enable V3 registration in a production runtime until **all match lifecycle transitions** are durably scheduled and verified. The route requires both `TOURNAMENT_ACTIVATION_SCHEDULER_ENABLED=true` and `TOURNAMENT_MATCH_LIFECYCLE_SCHEDULER_ENABLED=true`, complete Cloud Tasks/WIF configuration, and `TOURNAMENT_CLOUD_TASKS_RECONCILER_AUDIENCE`. The match-lifecycle flag must remain unset because that worker integration is not yet implemented. Missing or malformed configuration fails closed for production registration.

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

Cloud Tasks delivery is at least once and scheduled delivery is best effort, not an exact five-second execution guarantee. Workers must remain idempotent. Reconciliation latency is determined by the configured Cloud Scheduler interval; late activation must start participant windows from the actual server activation timestamp.

## Release gate still required

This repository does not provision Google Cloud resources or IAM. The current implementation does not schedule the full match lifecycle. Do not describe Tournament V3 as fully unattended or production-ready until the activation infrastructure is verified and durable tasks are created for every approved match lifecycle transition, with actual-handler and browser lifecycle evidence. No Cloud Tasks queue, service account, IAM grant, Cloud Scheduler job, Firebase index, or Vercel configuration was created by this change.
