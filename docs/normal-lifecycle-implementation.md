# Normal Challenge lifecycle continuation

## Scope and preservation

Development remains in `C:\Dev\New-Challenge-Suite`, on `main`, based on
`147ffbf963dcab7e2987617fe8165c0b2f3d5dc9`. Changes are uncommitted. No production
resources, provider accounts, Rules, indexes, branches, or reference worktrees were changed.
Existing local modifications, generated files, caches, and reports remain preserved.

New unattended lifecycle processing explicitly requires `normalLifecyclePolicyVersion: 1`.
Historical challenges are not silently migrated or financially recalculated.

The review transaction rechecks the existing Free Basic lifetime creation limit against
all owned challenges, including concurrent review requests. `reviewCreatorPlanId`
records the review entitlement without rewriting the original creation plan.
Submission correction timestamps and the five-minute review timer are recorded after
media verification completes inside the accepted update transaction.

## Policy implementation

| Area | Responsible implementation | Verification boundary |
| --- | --- | --- |
| Optional zero Base Prize; positive minimum $5; exact owner funding | `lib/normal-base-prize-policy.ts`, challenge validation, publication and review transaction, prize funding checkout | Local policy and review transaction tests; live Stripe not verified |
| 20-minute Normal paid entry | `lib/server/monetization-payments.ts`, entry checkout and webhook | Demo transaction and capacity tests; original payment identities retained |
| Original admission and canonical submissions | Submission creation and edit routes | Ownership, admission, media metadata, duplicate and deadline guards; trusted content scanning remains separate |
| Full 24-hour correction and appeal | Resubmission policy, Normal moderation service, appeal route and UI | Actual handlers in Auth/Firestore/Storage emulators |
| Five-minute conditional correction approval | Normal lifecycle worker and `submissionSafetyReviews` | Only exact-revision trusted clean evidence permits approval; no fabricated clean results |
| Actual voting activation and complete voting duration | Normal lifecycle worker, challenge status helpers | Transactional moderation/appeal rechecks and persisted effective timestamps |
| Final votes and No Winners | Immutable lifecycle snapshot and winner proposal validation | No automatic announcement or money distribution to nonexistent winners |
| Fixed/qualified allocation | Normal allocation helper and internal settlement | Combined pool rounding conserves source totals and placement totals |
| Admin approval and results publication | Winner approval/announcement routes and settlement transaction | Atomic approval/settlement; current admission and authoritative winner records rechecked |
| Refunds and exceptional holds | `lib/server/normal-refunds.ts`, Admin refunds, Stripe webhook | Provider-result reconciliation and idempotency tested with deterministic fixtures |
| Finalized disqualification | Normal disqualification service and Admin operations | Affected unpaid credits freeze; completed payouts and unaffected winners remain preserved |
| 72-hour clearance and partial withdrawals | Normal earnings clearance, withdrawal service/routes and wallet UI | Local accounting; no actual provider payout capability activated |
| Durable automation and notification fanout | Normal outbox/scheduler/worker/notification services | Fake scheduler and local transaction tests; production dispatch is unconfigured |

## Financial evidence and accounting

- Creator and Sponsor prize-designated funding remains separate from 65/20/15
  eligible generated-revenue accounting. DoroCoins are not cash funding.
- Normal Sponsor reservations remain 15 minutes. Normal entry reservations remain
  20 minutes. Retries do not extend either persisted original reservation.
- Sponsor evidence retains the conservative verified successful-provider-event upper
  bound. It does not claim that `Charge.created` or `Event.created` is the exact capture
  timestamp. The whole uncertainty interval must precede the applicable boundary.
- New Normal records waiting for moderation close Sponsor funding at effective voting
  activation, not the superseded planned start. The confirmation transaction reads the
  current authoritative challenge so activation and funding decisions serialize.
- Inconsistent, ambiguous, disputed, restricted, and late successful payments retain
  provider references and enter existing review/refund accounting without prize credit.
- Settlement rereads funding identities, amounts, restrictions, winner admission, and
  refund liabilities transactionally. A stale preview cannot create credits.
- Internal earnings credit, clearance, withdrawal reservation, and provider-confirmed
  disbursement are different states. No local mock is reported as a completed payout.

## New persisted data

Collections: `normalLifecycleJobs`, `normalLifecycleEvents`,
`normalNotificationOutbox`; existing `appeals`, `refundCases`, `auditLogs`,
`adminActionTasks`, cash ledger/wallets, payments, and submission revisions are reused.
Trusted `submissionSafetyReviews` records must identify the exact revision and media
path. They are not supplied by an untrusted participant.

Challenge fields include the policy version, moderation gate, configured/effective
voting times, final vote snapshot reference, No Winners outcome, guaranteed Base Prize
lock, and financial resolution restrictions. Withdrawal version 2 stores per-source
reservations and preserves original earning records.

The local index manifest adds `normalLifecycleJobs` COLLECTION:
`dispatchState ASCENDING`, `runAt ASCENDING`. It has not been published.
No production backfill has been run.

## Operational activation boundaries

Normal scheduling uses the existing Cloud Tasks transport, with separate configuration:

- `NORMAL_LIFECYCLE_SCHEDULER_ENABLED`
- `NORMAL_CLOUD_TASKS_QUEUE`
- `NORMAL_CLOUD_TASKS_WORKER_URL`
- `NORMAL_CLOUD_TASKS_ENQUEUER_SERVICE_ACCOUNT`
- `NORMAL_CLOUD_TASKS_INVOKER_SERVICE_ACCOUNT`
- `NORMAL_CLOUD_TASKS_OIDC_AUDIENCE`
- Existing platform WIF/OIDC configuration
- `NORMAL_AUTOMATIC_REFUNDS_ENABLED` (disabled unless separately authorized)

The worker accepts authenticated POST requests at `/api/internal/normal-lifecycle`.
Versioned task identities, transactional leases, stale-version rejection, recovery,
and durable fanout support retries. A separately configured protected reconciliation
trigger is still needed for unattended recovery of failed dispatch/delivery. No queue,
IAM policy, scheduler, or cloud service was provisioned or activated.

## Remaining external and implementation boundaries

### Three-blocker continuation

- Published material-change proposals now use `normalMaterialChangeRequests` with
  existing/proposed snapshots, stale-state checks, transactional decisions, single
  Admin permission checks, recent authentication, explicit confirmation, required
  reasons, audits and durable participant/creator notices. The creator management
  page and Admin overview expose the workflow. Supported changes are rules,
  instructions and future deadline extensions. Financial/classification overrides,
  expired-window reopening, and changes after effective voting activation remain
  unavailable rather than bypassing existing commitments. Broader field-specific
  participant-impact review is not claimed implemented.
- Normal checkout reconciliation retrieves the original Stripe Session, expires an
  open unpaid Session using its documented API, rereads it and checks its PaymentIntent.
  Only a terminal unpaid Session with no PaymentIntent or a canceled, zero-received
  PaymentIntent can authorize restart. Successful or ambiguous states await the
  existing verified webhook/Admin process. No completion time is fabricated.
  `normalEntryAttempts` selects the current attempt transactionally; old payment
  documents, Session identifiers and idempotency keys remain intact. Concurrent
  restarts select one new 20-minute reservation. Enterprise exposure reconciliation
  remains fail-closed; no enterprise financial reservations are silently rewritten.
- The protected Normal lifecycle endpoint now also accepts an authenticated GET
  recovery trigger, compatible with an explicitly configured scheduler. This does
  not create or activate a scheduler, queue, credential, IAM grant or production job.
- Read-only Vercel metadata still shows no Normal Cloud Tasks, scheduling, recovery
  secret or financial/email activation flags. Unattended production operation is
  not operationally verified and remains a deployment blocker.

The new collections are server-only under the existing catch-all deny rule; no
client-write permissions or live Rules/index changes were introduced.

### Current remediation additions

- `financial-transaction.ts` restarts an entire atomic database callback, at most
  three fresh transactions, only for code 3 with the exact invalid/closed transaction
  response observed following lock timeouts. The installed SDK retries expired
  transaction wording but not this closed response. Other errors and exhausted retries
  propagate. Provider calls must never run inside these callbacks.
- Withdrawal reads use transactional `getAll`; finalized disqualification reads only
  the affected user's challenge credits. Durable request/participant guards retain
  idempotency, and a duplicate finalized decision also recognizes `winnersApprovedAt`.
- Completion and pending-result-review notices now have durable notification identities.
- Worker wake-ups include pending entry-reservation expiration timestamps.
- `normalEmailOutbox` uses the existing email adapter behind the separate, default-off
  `NORMAL_EMAIL_DELIVERY_ENABLED` flag. Transactional claims, provider idempotency,
  bounded batches, retry state, and an old-uncertain-delivery review hold are implemented.
  Provider acceptance is not represented as recipient delivery. No real email was sent.
- Resend documents a 24-hour idempotency retention period:
  https://resend.com/changelog/idempotency-keys . Uncertain attempts older than 23 hours
  require reconciliation rather than blindly resending outside that period.

Read-only Vercel CLI inspection confirmed project
`prj_RuZ2HwHUfOxCubMH1EfvB4Bkm6RX` in `seyiflemar27s-projects`. Its Production variable
inventory contains no Normal scheduler/Cloud Tasks configuration or Normal email flag.
The existing email provider variable names are present; presence does not verify delivery.
Unattended lifecycle operation remains an essential deployment blocker. No Vercel
settings were changed and no deployment was attempted.

1. A payout provider, supported bank destinations, KYC/custody contract, fee quotation,
   and verified callback contract remain unapproved/unconfigured. The provider-neutral
   interface is intentionally unavailable. PayPal and Payoneer are not presented as
   active payout integrations.
2. Trusted scanning and outbound email delivery are not established by emulator tests.
   Corrections without trusted clean safety evidence remain in Admin review. In-app
   notices record email as unavailable rather than delivered.
3. Live Stripe behavior and failure/retry semantics require authorized provider test-mode
   verification. Fixtures establish local accounting only.
4. Historical active challenges require an explicit migration/reconciliation plan before
   activating version 1 automation. Historical settled transactions remain unchanged.
5. Published material changes remain blocked by the safe descriptive editor. A complete
   field-specific Admin change-review workflow is not claimed complete; immutable
   classification/funded guarantees must never be overridden by generic approval.
6. Production financial corrections, automatic refund activation, Rules/index publication,
   payouts, deployments, commits, and pushes were not performed.
7. US-only registration, age restrictions, and launch-stage KYC eligibility enforcement
   remain deferred as instructed. International developer access is preserved.
8. A fresh paid-entry checkout after an unresolved expired attempt remains fail-closed.
   The original reservation/payment is preserved rather than overwritten or extended.
   A complete provider-backed expire/reconcile/new-attempt journey still needs verification;
   the local tests do not establish the absence of a late charge from an older open Session.

## Verification interpretation

Pure policy tests, actual server handlers, emulator transactions, Storage Rules tests,
browser journeys, typecheck, lint, and production builds are separate evidence classes.
The P0 runner now includes the new Normal lifecycle suites. The existing browser suite
does not cover every Normal financial/moderation lifecycle state, and its success alone
does not establish complete production readiness.
