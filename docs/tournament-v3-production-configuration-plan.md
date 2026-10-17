# Tournament V3 Production configuration plan — not applied

Target remains `challenge-suite`, Firestore `(default)`, existing Vercel `challenge-suite` project serving `www.challengesuite.com`. User explicitly requires live indexes, Rules, IAM, settings and deployments to remain unchanged during this continuation. No command in this plan has been executed.

## Additive indexes, only after separate authorization

Re-list the exact project's live index inventory immediately before any future publication. Compare normalized collection ID, query scope and ordered field list. Skip READY and building definitions; never replace/delete an existing index, deploy the complete manifest or change Rules. Wait for every required index to become READY before enabling dependent operations.

All definitions below are COLLECTION scope; all listed fields are ASCENDING, in exactly this order:

| Collection | Fields | Dependent operation |
|---|---|---|
| tournamentJobs | status, runAt | due activation recovery |
| tournamentJobs | status, type, runAt | due match lifecycle jobs |
| tournamentJobs | status, type, schedulerDispatchState, runAt | pending dispatch recovery |
| tournamentJobs | status, type, schedulerDispatchState, createdAt | undispatched creation recovery |
| tournamentJobs | status, type, schedulerDispatchState, schedulerDispatchLeaseUntilAt | abandoned dispatch lease recovery |
| tournamentVotes | tournamentId, matchId, voterId | voter/match authorization and duplicate checking |
| tournamentVotes | tournamentId, matchId, voteSequence | complete paginated result verification |
| tournamentTeamInvitations | tournamentId, inviteeUserId | authorized team invitation inbox |

These definitions are present in `firestore.indexes.json`. The earlier read-only inventory and user context report them absent; no fresh live inventory is claimed by this document. New entitlement revision and email-outbox code uses single-field server queries and adds no composite definition.

## Authenticated durable scheduling

Use the existing Cloud Tasks adapter/outbox, not an alternative timer system. Independently verify existing APIs, location, WIF federation, queue and service-account permissions. The existing Normal lifecycle queue/recovery job must not be modified incidentally.

Required server variable names (never include values or credentials in audit output):

- GOOGLE_CLOUD_PROJECT, GOOGLE_CLOUD_PROJECT_NUMBER
- GOOGLE_WORKLOAD_IDENTITY_POOL_ID, GOOGLE_WORKLOAD_IDENTITY_POOL_PROVIDER_ID
- CLOUD_TASKS_LOCATION
- TOURNAMENT_CLOUD_TASKS_QUEUE
- TOURNAMENT_CLOUD_TASKS_WORKER_URL
- TOURNAMENT_CLOUD_TASKS_ENQUEUER_SERVICE_ACCOUNT
- TOURNAMENT_CLOUD_TASKS_INVOKER_SERVICE_ACCOUNT
- TOURNAMENT_CLOUD_TASKS_OIDC_AUDIENCE (or supported worker URL default)
- TOURNAMENT_CLOUD_TASKS_RECONCILER_AUDIENCE
- TOURNAMENT_ACTIVATION_SCHEDULER_ENABLED
- TOURNAMENT_MATCH_LIFECYCLE_SCHEDULER_ENABLED

The worker is authenticated `POST /api/internal/tournament-activation`, with only `{jobId, version}` as task data. Configure its exact HTTPS URL/audience and expected same-project invoker identity. The caller needs permission to enqueue in the chosen queue and act as the configured service account. Verify the Google-managed Cloud Tasks service agent's token-minting configuration. Use existing Vercel OIDC/WIF impersonation; do not introduce a service-account private key.

The recovery job is authenticated `POST /api/internal/tournament-scheduler`, on a separately reviewed recurring schedule, normally every minute. Configure its OIDC audience to exactly match the reconciler audience; its identity must pass the same expected-invoker check. Do not use the Cloud Scheduler service agent itself as the request identity. Verify Cloud Scheduler service-agent permissions and caller `iam.serviceAccounts.actAs` rights before creating the job. No anonymous financial or lifecycle endpoint is acceptable.

Proposed least-privilege review (not applied): `roles/cloudtasks.enqueuer` scoped to the selected queue for the enqueuer; `iam.serviceAccounts.actAs` on the exact task invoker (commonly `roles/iam.serviceAccountUser`, scoped to that service account); `roles/iam.workloadIdentityUser` for the explicitly constrained federated principal on the impersonated enqueuer identity. Verify the existing Google-managed `roles/cloudtasks.serviceAgent` and `roles/cloudscheduler.serviceAgent` bindings rather than adding broad project roles. Vercel verifies the OIDC token in application code; a Cloud Run invoker grant is not a substitute. Actual identities, principal conditions, existing grants and service activation must be inspected again under future infrastructure authorization before any change. References: [Cloud Tasks roles](https://docs.cloud.google.com/iam/docs/roles-permissions/cloudtasks), [Workload Identity Federation](https://docs.cloud.google.com/iam/docs/workload-identity-federation).

See [Google Cloud Tasks HTTP authentication](https://docs.cloud.google.com/tasks/docs/creating-http-target-tasks#http_target_tasks_with_authentication_tokens) and [Cloud Scheduler HTTP authentication](https://docs.cloud.google.com/scheduler/docs/http-target-auth). Scheduling after five seconds is a not-before request, not an exact latency guarantee; all participant windows derive from actual activation. Duplicate delivery, leases, retries, stale state and recovery remain server-authoritative.

## Safe future sequencing

1. Obtain explicit authorization for the listed indexes and separately reviewed infrastructure/IAM/configuration changes.
2. Verify additive indexes are READY. Verify least-privilege identities, WIF, queue retries and authenticated worker/reconciler configuration in an authorized non-production environment first.
3. Keep both Tournament scheduling flags, entry payment activation, Sponsor funding activation, payouts and automatic returns disabled until their own evidence gates pass.
4. Complete current code verification, real provider test-mode evidence and required browser competition acceptance. Do not push `main` prematurely: it automatically deploys Production.
5. Only under separate release authorization, deploy through the existing Git integration and verify exact commit, READY state, domains and safe non-mutating smoke tests.
6. Enable only reviewed capabilities in the approved sequence. Observe authenticated dispatch, duplicate delivery, missed enqueue recovery and paused-state behavior before treating the lifecycle as unattended.

## Communications and financial safeguards

Tournament email uses the existing email executor/provider boundary. `TOURNAMENT_EMAIL_DELIVERY_ENABLED` remains false/unset; explicit recipient email permission, verified recipient identity, sender/provider authorization and an operational recovery schedule are required. Existing settings currently keep email preferences disabled. Provider acceptance is not inbox delivery. No paid provider was activated.

Team corrections apply only to safely pending internal credits. Completed, reserved, disputed, fee-bearing legacy or otherwise uncertain funds require reconciliation holds. No external payout, negative balance, automatic clawback or replacement funding source is introduced. An application rollback cannot undo financial/provider side effects; preserve append-only entitlement revisions and audit records. Provider-backed payout execution remains separately disabled and unverified.
