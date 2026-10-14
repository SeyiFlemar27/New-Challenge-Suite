# Normal lifecycle continuation verification

## Current Production infrastructure release checkpoint

This section supersedes older infrastructure-blocked checkpoints below.

- Explicit approval obtained for the single `normalLifecycleJobs` composite index;
  it is now READY in `challenge-suite / (default)`.
- Dedicated queue, service accounts, least-privilege IAM, Production-only Vercel WIF
  provider, and authenticated one-minute recovery schedule are configured. Queue
  and schedule remain paused until the exact deployed artifact passes readiness.
- Required Production-only configuration is saved. Automatic refunds and outbound
  email are explicitly disabled; no payout adapter or scanning bypass is enabled.
- Enterprise terminal-unpaid reconciliation now releases exposure transactionally
  once, validates organization identity, and reserves only replacement exposure.
  Inconsistent or missing evidence remains held.
- Focused demo Firestore checks: paid entry/Enterprise restart **27 assertions PASS**;
  material review **9 PASS**; scheduler/notifications **19 PASS**. Emulator exit **0**.
- Read-only dispatch and authentication fixture checks: **7 assertions PASS**.
- TypeScript, full lint, affected-script lint and diff integrity: **PASS**.
- Final isolated Production build **PASS, exit 0**, output
  `.next/normal-production-release-1792014311588`; log
  `%TEMP%\challenge-suite-normal-production-release-build.log`.
- The reviewed 113-file pre-build inventory was independently rehashed unchanged.
  Subsequent edits were limited to documentation and the new dispatch probe test.
  Local environment files, caches, generated types and lint reports are excluded.
- No comprehensive browser/P0 campaign, live payment, refund, payout, or customer
  email was executed. Live federation/worker verification follows Git deployment;
  local fixture results are not represented as live provider verification.

Infrastructure identities, scopes and recovery sequencing are recorded in
`docs/normal-lifecycle-production.md`. Historical verification limitations remain
documented below and are not erased by this focused release gate.

## Repository and scope

Workspace: `C:\Dev\New-Challenge-Suite`; branch `main`, upstream `origin/main`.
HEAD remains `147ffbf963dcab7e2987617fe8165c0b2f3d5dc9`.
No commits, pushes, deployments, provider activation, production data operations,
Rules/index publication, or reference-worktree changes were performed.
Existing source changes and local artifacts remain in place.

See `normal-lifecycle-implementation.md` for policy traceability and limitations,
and `normal-lifecycle-changed-files.md` for the combined dirty-source inventory.
That inventory includes pre-existing changes and is not a proposed staging list.

## Current execution evidence

| Check | Result | Scope |
| --- | --- | --- |
| TypeScript `tsc --noEmit --incremental false` | PASS | Current application source |
| Full `eslint .` | PASS | Current source before diagnostic-only test-message change |
| Actual submission and related API handlers | PASS, 63 assertions | Local Auth, Firestore, Storage; includes delayed media verification and Admin withdrawal guards |
| Base Prize policy | PASS, 18 assertions | Pure policy |
| Review funding and Free Basic concurrency | PASS, 25 assertions | Demo Firestore transactions |
| Paid entry | PASS, 14 assertions | Demo transactions and deterministic provider fixtures |
| Lifecycle | PASS, 28 assertions | Demo scheduling/moderation/voting outcomes |
| Financial lifecycle | Mixed: prior pass, latest runs FAIL | Concurrent withdrawal/disqualification query transactions fail with invalid/closed transaction after emulator lock timeouts |
| Settlement | PASS, 11 assertions in first full attempt | Demo financial invariants |
| Scheduler and notifications | PASS, 11 assertions in first full attempt | Fake transport and local durable fanout |
| Qualified allocation | PASS, 105 assertions in first full attempt | Exact conservation and qualified placement weights |
| Resubmission policy | PASS, 25 assertions in first full attempt | Normal and historical deadline rules |
| Sponsor reservations | PASS, 24 assertions in first full attempt | Deterministic timing and integrity checks |
| Enterprise active-cap concurrency | Full attempt FAIL; isolated rerun PASS | Strict assertions retained; sanitized failure diagnostics added |
| Latest full 49-suite P0 gate | FAILED / incomplete | Stopped first at Enterprise active-cap, next at Normal financial concurrency |
| Separate production-mode browser attempt | 9/10, 85 assertions | Normal Builder funding-label assertion failed; remaining nine journeys passed |
| Focused Normal Builder rerun after synchronization correction | PASS, 1/1 journey, 36 total assertions | 35 journey assertions plus uncaught-error check; isolated production build completed |
| Explicit changed-script lint with `--no-ignore` | PASS | Browser runner and Enterprise concurrency diagnostics |

Browser failure artifacts: `%TEMP%\challenge-suite-p1-browser-b08f7ff9c6a74d4dae2d8098336bcdf4`.
The builder test now uses Playwright's retrying visibility assertion for the exact
funding label across draft-route replacement. A separate wait followed by an immediate
visibility check still failed on the second full browser attempt (also 9/10, 85 assertions).
No arbitrary delay or funding expectation changed. The passing focused rerun is not
reported as a fresh complete 10/10 run.

Passing focused browser artifacts:
`%TEMP%\challenge-suite-p1-browser-461c2fe503d8440cbaf99b0519df2260`.
The focused filter intentionally skipped the other nine journeys; uncaught client errors
were zero. Test artifacts remain preserved. Only the owned temporary emulator
configuration was removed after its process exited.

These failures cannot be dismissed as emulator-only without further evidence.
No assertions, transaction guards, financial restrictions, or approval requirements
were weakened to obtain passing results. Earlier complete runs do not supersede
the latest failures. The latest combined runner did not reach its browser command;
browser verification is therefore executed separately.

## Seven-batch assessment

1. **Builder/publication:** implemented; funding, optional fields, compatibility and
   transactional quota checks have focused local evidence.
2. **Admission/submissions:** implemented core flow with focused evidence; provider-backed
   expiration/reconciliation/new-checkout retry remains insufficiently verified.
3. **Moderation/appeals:** implemented, actual-handler tested; trusted scan-provider
   integration remains unavailable, so unverified content stays in Admin review.
4. **Voting/results:** implemented and locally tested; dedicated full moderation-to-result
   browser coverage is not established by the general navigation suite.
5. **Financial reconciliation:** implemented core guards and accounting; concurrency
   verification is currently failed and live provider behavior remains unverified.
6. **Earnings/withdrawals:** internal reservation and clearance implemented; no approved
   payout provider or real disbursement verification. Not production-complete.
7. **Automation/integration:** durable local job state implemented; operational dispatch,
   recovery scheduling, email/scanning activation, and complete material-change Admin
   review are not claimed complete.

## Release blockers and next work

- Diagnose transaction lock timeouts and invalid/closed query transactions under
  concurrent withdrawal and finalized disqualification, then rerun all 49 suites.
- Verify paid-entry expired-session reconciliation and safe new-attempt checkout.
- Complete the field-specific published material-change Admin workflow; current
  descriptive editing intentionally cannot authorize financial changes.
- Obtain explicit provider/infrastructure approval before external payouts, trusted
  scanning, outbound email, unattended scheduling, or operational refund activation.
- Authorize a historical active-record migration separately; no settled history was
  silently changed. Publish required indexes only with separate authorization.

**Readiness:** further local remediation required. Not ready for production.
Local fixtures do not establish live Stripe, payout, email, scanning, or scheduler behavior.

## Focused transaction-remediation continuation — 2026-10-14

### Subsequent three-blocker continuation

- Material-review Firestore tests: **PASS, 9 assertions**, including unpublished
  proposal isolation, locked-field rejection, concurrent approval, rejection,
  notification persistence and stale-state rejection.
- Paid-entry Firestore/provider-fixture tests: **PASS, 22 assertions** in the final
  checkout-only rerun (earlier combined invocation: 21), including
  original 14 checks, verified terminal-unpaid reconciliation, concurrent restart,
  original record preservation, blocking a second charge for successful payment,
  and rechecking registration state transactionally after provider reconciliation.
- Scheduler/notification tests: **PASS, 19 assertions**. The combined focused
  emulator invocation and shutdown exited **0**. No full P0/browser suite was run.
- Typecheck: **PASS**. Affected application/script lint: **PASS**, after fixing the
  initial React effect lint failure without suppressing the rule.
- UI behavior is source-verified, not freshly browser-verified. Stripe requests are
  deterministic fixtures; no live Session expiration, payment or refund was run.
- Final production build after the registration-race guard: **PASS, exit 0**,
  including Next.js compilation, TypeScript validation and page generation.
  Output: `.next/normal-blockers-final-1792013313061`; log:
  `%TEMP%\challenge-suite-normal-blockers-final-build.log`. Demo configuration was
  used; build-added type paths were removed while preserving existing changes.
- Correct Vercel project and Production variable metadata were rechecked. Required
  Normal scheduler/queue/worker/WIF/recovery configuration is not present. No
  infrastructure was provisioned and no Production settings were changed.
- Production database metadata confirms `challenge-suite / (default)`, Standard
  edition. Read-only deployed index inventory contains no `normalLifecycleJobs`
  composite. The local required COLLECTION definition is `dispatchState ASCENDING`,
  `runAt ASCENDING`; publication still requires specific approval. No documents were
  read and no index was created.
- Live domain metadata still identifies READY Production deployment
  `dpl_FXNYTABh8oCSEYrcNSgPXMZP3GQ7`, with `www.challengesuite.com`,
  `challengesuite.com` and `challenge-suite.vercel.app`. It was not replaced.
  No new commit, push or deployment occurred. Final source inventory: 123 entries,
  HEAD `147ffbf963dcab7e2987617fe8165c0b2f3d5dc9`, branch `main`.

The following older checkpoint remains historical; the new supported material-review
and checkout-restart paths above supersede its claims that those paths are absent.
Broader material-field approval and Enterprise checkout-restart accounting remain
restricted. Operational scheduling is still required before deployment.

This checkpoint supersedes the failed focused financial concurrency result above;
it does not supersede the historical incomplete comprehensive runner or browser run.
The user explicitly deferred comprehensive testing. No full P0 or browser rerun was
performed during this continuation.

- Exact closed-transaction retry policy: **PASS, 11 assertions**. A fresh complete
  transaction is started at most three times for the demonstrated INVALID_ARGUMENT
  closed-transaction error; unrelated errors and exhausted retries still fail.
- Financial lifecycle concurrency: **PASS, 24 assertions, two focused executions**.
  Withdrawal reads are batched with `getAll`; finalized disqualification queries
  are scoped to the affected user. Ledger/idempotency assertions remain intact.
- Lifecycle outcomes and durable completion notices: **PASS, 30 assertions**.
- Scheduler, reservation expiration, and opt-in email queue: **PASS, 19 assertions**,
  including provider-acceptance versus recipient-delivery distinction and uncertain
  old sends entering review. Email uses a deterministic adapter, not live delivery.
- One combined emulator invocation completed its child assertions but its CLI failed
  during shutdown. A subsequent focused Firestore invocation exited successfully.
- `git diff --check`: **PASS**, with line-ending warnings only.
- TypeScript `tsc --noEmit --incremental false`: **PASS**.
- Full `eslint .` and explicit `--no-ignore` lint of the four affected regression
  scripts: **PASS**.
- The sandboxed fresh build failed fetching the existing Manrope font from Google
  Fonts. The subsequent network-enabled, isolated demo-configured production build
  **PASSED, exit 0**, including compilation, type validation, and page generation.
  Output: `.next/normal-final-network-build-1792011839813`. Log:
  `%TEMP%\challenge-suite-normal-final-network-build.log`. No font or authentication
  workaround was made. Build-added type includes were removed without discarding
  the pre-existing configuration changes.

The observed retry gap is in the installed Firestore SDK's handling of the exact
invalid/closed transaction error after contention. No evidence established that
application callbacks intentionally reused transaction objects. The bounded repair
does not guarantee that all future contention will succeed.

Production project metadata was read without retrieving secret values. Project
`prj_RuZ2HwHUfOxCubMH1EfvB4Bkm6RX` belongs to the intended scope. Saved Production
metadata does not include the Normal lifecycle scheduling/Cloud Tasks variables or
the Normal email/refund activation flags. No queue, IAM, recovery trigger, Rules,
indexes, or provider configuration was activated.

Deployment remains blocked by unattended Normal lifecycle dispatch/recovery and
required unpublished index compatibility. The existing field-specific material-change
Admin workflow and provider-backed expired-checkout reconciliation/new-attempt journey
remain incomplete or insufficiently verified. Payout adapters and trusted scanning are
unavailable; their dependent operations remain restricted. No commit, push, or
deployment was performed. Existing source changes and local artifacts were preserved.
