# Normal lifecycle Production configuration

## Target and preservation

Repository: `C:\Dev\New-Challenge-Suite`, branch `main`.
Base commit: `147ffbf963dcab7e2987617fe8165c0b2f3d5dc9`.
Vercel project: `prj_RuZ2HwHUfOxCubMH1EfvB4Bkm6RX`, team
`team_Aof3F7rzekkBNGBsPb6p9XmO`; Git integration Production branch verified as `main`.
The reviewed 113-file source inventory remained hash-stable during local build
preparation; local caches, environment files, generated types and lint reports are
excluded from release staging and preserved.

## Infrastructure

- Google/Firebase project `challenge-suite`, number `599920137316`.
- Cloud Tasks queue `projects/challenge-suite/locations/us-central1/queues/normal-lifecycle`.
  Dispatch capped at two requests/second and two concurrent requests; ten attempts,
  10–300-second backoff, up to 24 hours retry duration.
- Recovery job `projects/challenge-suite/locations/us-central1/jobs/normal-lifecycle-recovery`,
  every minute in UTC, authenticated POST `{ "action": "reconcile" }`.
- Enqueuer: `normal-lifecycle-enqueuer@challenge-suite.iam.gserviceaccount.com`.
  Queue-scoped `roles/cloudtasks.enqueuer`, and service-account-user permission on
  the invoker. No user-managed private key was created.
- Invoker: `normal-lifecycle-invoker@challenge-suite.iam.gserviceaccount.com`.
  Workers verify Google issuer, audience, verified email and exact invoker identity.
- Workload Identity pool `challenge-suite-vercel-prod`, provider `vercel-prod`.
  Team issuer mode and exact team ID, project ID, Production environment and subject
  conditions restrict Vercel impersonation to this Production project.
- Google-managed Cloud Tasks/Scheduler service agents retain their own service-agent
  roles; existing IAM bindings and etags were preserved.
- The explicitly approved `normalLifecycleJobs` COLLECTION index is READY:
  `dispatchState ASCENDING`, `runAt ASCENDING`, implicit document-name ordering.
  No other indexes or Rules were published.

The queue and recovery schedule are initially paused. Resume only after the exact
Git deployment is READY and authenticated read-only worker health succeeds. The
health action verifies federation and `cloudtasks.tasks.create` permission without
reading challenge records, running transitions, or performing financial operations.

## Production-only configuration

Configured variable names: `GOOGLE_CLOUD_PROJECT`, `GOOGLE_CLOUD_PROJECT_NUMBER`,
`CLOUD_TASKS_LOCATION`, `GOOGLE_WORKLOAD_IDENTITY_POOL_ID`,
`GOOGLE_WORKLOAD_IDENTITY_POOL_PROVIDER_ID`, `NORMAL_CLOUD_TASKS_QUEUE`,
`NORMAL_CLOUD_TASKS_WORKER_URL`, `NORMAL_CLOUD_TASKS_OIDC_AUDIENCE`,
`NORMAL_CLOUD_TASKS_ENQUEUER_SERVICE_ACCOUNT`,
`NORMAL_CLOUD_TASKS_INVOKER_SERVICE_ACCOUNT`, `NORMAL_LIFECYCLE_SCHEDULER_ENABLED`.
Existing Firebase and Stripe variables were not replaced or decrypted.
Preview and Development configuration was not changed.

`NORMAL_AUTOMATIC_REFUNDS_ENABLED=false`, `NORMAL_EMAIL_DELIVERY_ENABLED=false`.
No payout adapter is configured. Missing trusted scanning still requires Admin
review; no scan evidence is fabricated. No historical challenge migration runs.

## Supported changes and reconciliation

Material-change review supports the implemented rules, instructions and future
deadline-extension paths, with reasons, confirmation, recent Admin authentication,
stale-state protection, audit records and durable notices. Locked classification,
prize guarantees, eligibility and financial changes have no override.

Enterprise checkout restart now releases only verified terminal-unpaid reservation
exposure, in the same transaction that marks restart eligibility. It rechecks the
organization against the authoritative challenge and existing exposure record.
Concurrent reconciliation cannot release twice. Missing/mismatched legacy evidence
remains held; confirmed funds and completed provider payments are not rewritten.

## Release and recovery

Use the existing automatic Git deployment from `origin/main`; do not substitute a
manual Preview promotion. Verify the exact commit, READY status and custom-domain
assignments. Probe worker authentication without customer financial operations.

If release verification fails, keep/pause both the dedicated queue and recovery job.
The pre-release Production rollback artifact is
`dpl_FXNYTABh8oCSEYrcNSgPXMZP3GQ7`. Restoring application routing does not reverse
Firestore, IAM, provider or ledger changes. Leave the additive index in place and
preserve all financial history. Do not fabricate refunds or payout reversals.

Local fixtures do not verify live Stripe, payout, email, scanning or competition
journeys. This release is not a declaration of full launch readiness.

References: [Vercel OIDC](https://vercel.com/docs/oidc/reference),
[Google authenticated scheduling](https://docs.cloud.google.com/scheduler/docs/http-target-auth).
