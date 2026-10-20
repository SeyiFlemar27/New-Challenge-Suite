# Tournament production change request — not applied

Target: Google Cloud/Firebase `challenge-suite` (`599920137316`), Firestore `(default)`, Vercel `challenge-suite` (`prj_RuZ2HwHUfOxCubMH1EfvB4Bkm6RX`), team `team_Aof3F7rzekkBNGBsPb6p9XmO`, domain `www.challengesuite.com`.

This request supersedes the earlier scheduling deferral. It is a proposed authorization scope, not evidence of completed provisioning or launch. No resources, IAM bindings, indexes, environment settings or deployment have been changed.

## Verified existing resources

Read-only audit used the explicitly authorized existing Firebase CLI login, without switching accounts. Project ID/number were checked against Resource Manager. Cloud Tasks, Cloud Scheduler, IAM, Logging and Monitoring APIs are enabled.

In `us-central1`, the fully paginated queue inventory contains only `normal-lifecycle` (RUNNING, 2 dispatches/second, 2 concurrent, 10 attempts, 10–300 second backoff, 24 hour retry duration). Scheduler contains only `normal-lifecycle-recovery`, every minute UTC, targeting the Normal worker with its own invoker. These resources must remain untouched.

The project service-account inventory contains Firebase Admin and the two Normal lifecycle identities. No Tournament identities exist. Existing WIF pool `challenge-suite-vercel-prod` and provider `vercel-prod` are ACTIVE. Its condition pins this Vercel team, project, Production environment and exact Production subject. Reuse it without broadening its condition. Google-managed Tasks and Scheduler service agents already have their expected service-agent roles.

No custom Monitoring alert policies or log-based metrics were returned. Provider/runtime logging availability is not a substitute for alert coverage. Notification-channel selection and alert implementation remain to be reviewed.

Production Vercel environment metadata contains the shared project/location/WIF keys, but no Tournament worker/queue/identity/audience/flag keys. Presence of a name does not verify its value or authorize enabling it.

## A. Eight strictly additive Firestore indexes

Read-only production query probes selected no document content and output no record IDs. Each following shape failed with Firestore code 9 and an explicit missing-index diagnostic. All are COLLECTION scope. Document-ID ordering is shown explicitly; Firestore may add the same ordering implicitly.

| Collection | Fields in order | Dependent query |
| --- | --- | --- |
| tournaments | privacy ASC, createdAt DESC, __name__ DESC | Explore recent |
| tournaments | privacy ASC, createdAt ASC, __name__ ASC | Explore ending-soon Tournament source |
| tournaments | privacy ASC, participantCount DESC, __name__ DESC | Explore participants |
| tournamentJobs | status ASC, type ASC, runAt ASC, __name__ ASC | due activation/lifecycle processing |
| tournamentJobs | status ASC, type ASC, schedulerDispatchState ASC, runAt ASC, __name__ ASC | accepted but overdue lifecycle delivery recovery |
| tournamentJobs | status ASC, type ASC, schedulerDispatchState ASC, createdAt ASC, __name__ ASC | pending outbox dispatch |
| tournamentJobs | status ASC, type ASC, schedulerDispatchState ASC, schedulerDispatchLeaseUntilAt ASC, __name__ ASC | abandoned dispatch lease recovery |
| tournamentVotes | tournamentId ASC, matchId ASC, voteSequence ASC, __name__ ASC | complete paginated vote verification |

Exact definitions: `automatic-publishing-required-index-additions-2026-10-20.json`. Production currently has 18 composite indexes; none for Tournaments. Do not deploy the full 82-definition manifest or all absent definitions. Immediately re-list before creation, normalize implicit document-ID ordering, skip equivalent READY/BUILDING definitions, and wait for every required index to be READY. Index creation incurs storage/write-maintenance cost and asynchronous backfill. No deletion or replacement is proposed; rollback can leave additive indexes in place.

The tested registration-recovery shape, three-equality legacy voter query and two-equality invitation query already succeed without their documented composite definitions. Existing single-field index merging serves them; do not create unnecessary composites. The six public/private Explore query shapes also succeed. The old two-field jobs status/runAt definition has no current release dependency found in the activation/lifecycle paths, which also filter type; do not create it merely because an older plan listed it.

## B. Dedicated Tournament scheduling resources

Proposed new resources in the existing project, after separate authorization:

1. Service accounts `tournament-lifecycle-enqueuer@challenge-suite.iam.gserviceaccount.com` and `tournament-lifecycle-invoker@challenge-suite.iam.gserviceaccount.com`, with no private keys.
2. Queue `projects/challenge-suite/locations/us-central1/queues/tournament-lifecycle`. Initial limits: 5 dispatches/second, 10 concurrent; retry up to 10 attempts and 24 hours, 10–300 second backoff, 5 doublings. Review these limits against measured worker duration before activation. Delivery is at least once; a five-second schedule is a not-before target, not a latency guarantee.
3. Queue-scoped `roles/cloudtasks.enqueuer` for the new enqueuer only.
4. Invoker-service-account-scoped `roles/iam.serviceAccountUser` for that enqueuer only.
5. Enqueuer-service-account-scoped `roles/iam.workloadIdentityUser` for the existing exact Production subject: `principal://iam.googleapis.com/projects/599920137316/locations/global/workloadIdentityPools/challenge-suite-vercel-prod/subject/owner:seyiflemar27s-projects:project:challenge-suite:environment:production`.
6. Scheduler `projects/challenge-suite/locations/us-central1/jobs/tournament-lifecycle-recovery`, initially PAUSED, `* * * * *`, `Etc/UTC`, HTTPS POST to `https://www.challengesuite.com/api/internal/tournament-scheduler`, OIDC identity the new invoker and audience exactly that URL. Proposed retry policy: 3 retries, 10–60 second backoff, 3 doublings. Review request deadline against measured reconciliation duration and avoid overlapping broad scans.

Worker target and OIDC audience: `https://www.challengesuite.com/api/internal/tournament-activation`. Task JSON remains only `{jobId, version}`. Never invoke a live reconciliation or lifecycle worker as a supposedly read-only smoke test: it can modify legitimate competitions. Controlled worker/task verification requires separately approved isolated competition/job records and cleanup rules.

No changes to existing Normal resources, WIF provider constraints or project-wide roles are proposed. Existing service-agent grants need no replacement. Read current policies immediately before any additive binding; preserve etags and unrelated members. Costs include task dispatch/retry and Scheduler execution. Stop on unexpected identity/resource differences rather than broadening IAM.

## C. Server-only Vercel configuration — staged activation

Reuse verified existing shared project, number, WIF pool/provider and `us-central1` location. Separately authorize creation of Production-only keys pointing to the exact queue, worker, enqueuer and invoker above:

- `TOURNAMENT_CLOUD_TASKS_QUEUE=tournament-lifecycle`
- `TOURNAMENT_CLOUD_TASKS_WORKER_URL` and `TOURNAMENT_CLOUD_TASKS_OIDC_AUDIENCE`: exact worker URL above
- `TOURNAMENT_CLOUD_TASKS_ENQUEUER_SERVICE_ACCOUNT` and `TOURNAMENT_CLOUD_TASKS_INVOKER_SERVICE_ACCOUNT`: dedicated identities above
- `TOURNAMENT_CLOUD_TASKS_RECONCILER_AUDIENCE`: exact reconciler URL above
- `TOURNAMENT_ACTIVATION_SCHEDULER_ENABLED=false`
- `TOURNAMENT_MATCH_LIFECYCLE_SCHEDULER_ENABLED=false`

Do not turn either flag on or resume Scheduler until indexes, authenticated WIF enqueue, worker identity/audience, controlled lifecycle execution, recovery, media, tests and monitoring pass. Activating flags and resuming Scheduler require a separate reviewed activation step. A resulting Vercel rebuild must be verified by exact commit/READY/domain, not assumed.

Paid-entry configuration is a separate dependency: verify the existing `TOURNAMENT_ENTRY_PAYMENTS_ENABLED` boundary and provider test-mode webhook/late-payment/refund behavior. No live charges, refunds, payouts, Sponsor funding or Prediction Arena activation are authorized. Do not turn on a live payment flag merely to satisfy Tournament launch wording.

## D. Rollback and remaining approvals

Before any code or environment deployment, identify the currently serving READY deployment and source commit as the rollback target. An application rollback does not undo competition or financial transitions. If activation fails, keep new registrations fail-closed, preserve authoritative jobs, audit and financial records, and keep authorized recovery for active competitions available. Pause only the new Scheduler/queue when safe and reviewed; do not disable Normal processing. Leave additive indexes intact. Do not delete a queue containing pending competition work.

Approvals still required: the exact eight indexes; the new queue/accounts/scoped bindings/initially paused Scheduler; Production environment additions; alert policies and notification destination; controlled synthetic task/competition records; activation; and release/deployment under the user's latest separate-authorization instruction. Approval of a read-only audit or Storage probe does not authorize any of these mutations.
