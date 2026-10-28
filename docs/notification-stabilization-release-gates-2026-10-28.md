# Notification stabilization and release gate report — 28 October 2026

## Release status

**Not complete; not approved for Production publication.** No commit, push, deployment, Firebase index publication, provider activation or Production data write has been performed in this execution. Work remains preserved on local `main`, HEAD `ccf39f987a1bea52bad13f4090bf5ff6ea29e7c5`. The existing checkpoint was fast-forwarded into local main without resetting or discarding files. The fetched remote main baseline was `f6bcadb3f197d1a7f0f9341e340419775a781a9b`.

The owner's direct-main authorization remains conditional on complete acceptance. Pushing main automatically deploys Production, so an incomplete notification implementation must not be pushed. No alternative branch or manual deployment has been substituted.

## Implemented local changes

- Sequential/batched Firestore transaction reads in Normal payment confirmation, Enterprise quota reserve/release and Tournament refund claim/reconciliation. Original concurrency assertions and timeouts are retained; no blanket retries or error remapping were introduced.
- Central essential/optional notification policy and recipient-scoped event identifiers. Essential in-app delivery ignores legacy opt-outs; optional defaults preserve explicit choices. Existing inbox entries and read state survive retries.
- Durable notification delivery intents with pending-recovery outcomes and bounded recovery in existing lifecycle workers. Queued intent is distinguished from an actual inbox item and external delivery.
- Chronological, recipient-scoped inbox pagination, global retained-history unread aggregation, bounded resumable mark-all, logical twelve-month history retention, metadata allowlisting and restricted-account checks.
- Identity-scoped shared inbox hook, quiet foreground refresh, light notification page/bell, keyboard dismissal/focus handling, optional preferences and essential-update explanation in Settings.
- Scoped Tournament recipients; reduced routine Host noise; essential Individual missing-submission reminders and earlier reminder job checkpoints.
- Normal/Private six-hour and one-hour reminder fanout with current participation, account, submission and private-grant checks; stale deadlines suppressed.
- Live Event essential reminder scheduling separated from email preferences; shared promotional opt-in; guest-only email handling; retained notification read state; confirmed booking/check-in intents without ticket credentials.
- Live check-in correction is allowed to reconfirm arrival without recreating the original ticket notification intent. Missing guest preference records retain existing booking consent instead of being coerced into an explicit refusal.
- Dynamic Tournament payment confirmed/review/refunded types explicitly classified essential. The notification ID test now verifies recipient-scoped payment idempotency, retaining metadata and duplicate assertions.

## Release-blocking dependency: deployed Firestore indexes

Read-only Firebase metadata returned success for Production `challenge-suite`, default database **STANDARD**, location **nam5**. Production currently has the notifications composite `userId ASC, createdAt DESC, __name__ DESC`. The new unread OR queries and archived-unread subtraction additionally filter `status` and/or `read`. The required index shapes are absent; emulator success does not establish deployed index compatibility.

`notification-index-proposal-2026-10-28.json` contains review-only candidate composite definitions for user/status/date, user/read/date and user/status/read/date, in ascending and descending date orders for count/history query planning. This proposal is **not** the deployed configuration and has not been merged into the live deployment file or published. Before release, validate the exact query plans against an approved isolated Standard database, minimize definitions where proven redundant, obtain specific infrastructure authorization, and verify required indexes READY. Alternatively, implement and verify a safe index-compatible design without unbounded history reads. Do not push main to discover this issue in Production.

Private read-only cloud inventories and logs remain local and excluded from any prospective commit.

## Acceptance still incomplete (release blockers unless explicitly stated)

1. Required voter-only official result delivery, exact voted-context isolation and optional interest-based one-hour voting reminders are not implemented/verified end to end.
2. Remaining full event-source inventory is incomplete: financial/Admin/security source routing, customer support email boundaries, Sponsor legacy preferences versus shared policy, all Tournament correction/cancellation events and Live Event competitor results still require reconciliation.
3. Personal correction/resubmission deadlines extending beyond the Normal global submission deadline need dedicated scheduling and recipient validation.
4. Shared inbox actual authenticated HTTP-handler tests and new browser journeys across all six identities, delayed/error states, responsive layouts, cross-account cache isolation and accessibility remain unexecuted. Existing backend tests do not establish these journeys.
5. Sponsor still exposes its legacy notification matrix/history rather than the finalized single shared preference/history experience. Essential notices must not be represented as switchable there.
6. The bounded category scan can return an empty page with further history; its empty-state copy still needs to distinguish that from an empty entire history.
7. Durable delivery recovery fairness, failure boundaries and all critical business integrations require final verification. A pending outbox is not proof of delivery.
8. Publication repeatability beyond the latest complete run, final complete regression, final build/browser evidence and complete source review remain required before publication.

## Test evidence

Historical failures are preserved; isolated successes are not described as complete acceptance.

- Initial selected backend attempt stopped at an allowlist error before tests.
- Selected ordered-read run: 2/3; cancellation still failed. Diagnostic phase identified refund processing before withdrawal cases.
- After refund claim read batching: selected backend stabilization **3/3, exit 0**; original paid entry, Enterprise cap and cancellation concurrency assertions retained.
- Complete phase A: **78/80, exit 1**. All original three failure suites passed. New failures were Tournament payment notification mapping and duplicate Live Event delivery intent. This run is not superseded by a focused pass.
- First focused Live Event fix run: exit 1, guest announcement consent regression identified.
- Second focused Live Event run: exit 1, legacy reminder-disable assertion conflicted with the approved essential reminder policy.
- Updated focused Live Event acceptance: **348 assertions, exit 0**. Existing booking/payment/refund/authorization coverage remains in the suite; the obsolete disable expectation now reflects essential in-app reminders independent of optional email.
- Inbox emulator: retention, recipient ownership, pagination, global unread beyond 100, complete mark-all, optional preferences, read preservation and durable recovery assertions passed in phase A.
- Normal reminder emulator: 11 assertions passed in phase A.
- Scoped Tournament notification emulator: 26 assertions passed in phase A.
- Latest TypeScript: `pnpm.cmd typecheck`, exit 0.
- Latest full lint: `pnpm.cmd lint`, exit 0.
- Full phase B and local Production build: pending when this section was first written; final result must be appended below.

## File inventory and exclusions

`notification-modified-tracked-files-2026-10-28.txt` records all modified tracked paths, including pre-existing generated/configuration changes that are **not** automatically in scope for staging.

New implementation files: `lib/notification-policy.ts`, `lib/hooks/use-notifications.ts`, `lib/server/normal-submission-reminders.ts`, `components/notification-preferences.tsx`, `app/api/notifications/preferences/route.ts`.

New tests: `scripts/test-backend-stabilization-emulator.mjs`, `scripts/test-notification-inbox-emulator.mjs`, `scripts/test-normal-notification-reminders-emulator.mjs`.

Tracked modifications cover notification APIs/UI/navigation; payment/quota/refund read ordering; Normal/Tournament/Live Event notification/reminder/lifecycle integrations; explicit verification runner allowlists and affected test expectations. Audit documentation and this report/proposal/inventory are local project evidence.

Preserve and exclude credentials, local environment/configuration, `.pnpm-store`, raw emulator/browser sessions, cloud inventories, logs and machine-specific generated `next-env.d.ts`, `tsconfig.tsbuildinfo`; pre-existing `tsconfig.json` changes require separate attribution review. Historical untracked release documents, recovery snapshots and reference worktrees remain preserved and are not blindly staged.

## Boundaries preserved

Single existing Admin model, authorized workspace isolation, D24/D27 scoped holds, historical financial records and existing six-dashboard/Explore/Detail work remain preserved. No Tournament activation, new-policy registration enablement, scheduler activation, real payment/refund/payout, provider configuration, Rules/index publication or Production write was authorized or performed. External email/provider acceptance and live account journeys are unverified.

Local implementation complete: **No**. New Git commit: **No**. Main push: **No**. Staging acceptance: **No**. Production deployment: **No**.

## Approved requirement coverage matrix (current local state)

| Requirement area | Evidence-backed status | Remaining acceptance |
| --- | --- | --- |
| Existing system reuse, one collection | Implemented in central helper and shared hook | Reconcile remaining direct writers and Sponsor legacy screen |
| Essential/optional policy and defaults | Implemented; emulator coverage | Complete source-type inventory, account restrictions and HTTP coverage |
| Normal/Private participation and lifecycle | Partial | All lifecycle/cancellation/result events, correction deadline scheduling |
| Private recipient privacy | Reminder grant checks covered locally | Full grant/revoke/participation notification journey |
| Individual Tournament match recipient scope | Scoped delivery and 26-assertion test | All hold/correction/cancellation/disqualification event sources |
| Legacy Team compatibility | Existing paths retained | Complete notification journey not established |
| Six/one-hour Tournament reminders | Essential delivery and earlier job checkpoints implemented | Complete lifecycle/browser acceptance and legacy Team audit |
| One-hour optional voting reminders | Missing end-to-end implementation | Current interest, permission, eligibility, window and dedupe tests |
| Voter-only official results | Preference/type exists; delivery not established | Exact voted-context fanout, free/paid dedupe, cross-match isolation |
| Live Event booking/check-in/reminders | 348-assertion integrated suite passes | Full results audience and browser acceptance |
| Guest event contacts | Consent fallback and existing scoped email tests pass | No live email acceptance; no guest in-app identity |
| Financial states and no paid-vote spam | Existing financial safeguards preserved | Complete truthful event-source and noise inventory |
| Creator/Host/Admin important-only notices | Partial scope correction | All actionable cases, single-Admin routing, no routine fanout |
| Support | Existing email workflow preserved | Remove/reconcile competing in-app conversation notices where required |
| Bell and full history | Implemented locally | Browser keyboard, focus, responsive, delayed/error and identity journeys |
| Global unread / mark-all / retention | Backend emulator assertions pass | Deployed index readiness and HTTP/browser acceptance |
| Shared Settings | Implemented locally | Sponsor preference reconciliation and authenticated handler acceptance |
| Durable recovery | Pending/created/skipped recovery assertions pass | Full source integration, starvation/fairness and business-failure boundaries |
| Live payments/email/scheduling | Unverified and unavailable unless already authorized | No real provider operations were performed |
| Direct-main commit/push | Not executed | All mandatory release gates must pass first |

## Final completed backend rerun

`CHALLENGE_SUITE_CONTINUE_REGRESSIONS=true; node scripts/run-isolated-p0-emulators.mjs C:\Users\seyia\AppData\Roaming\npm\node_modules\firebase-tools` completed **80/80 suites, 0 failures, process exit 0**. Sanitized per-suite commands/timestamps/exit codes are retained in `notification-regression-phase-b-2026-10-28.json`; phase A's 78/80 failure evidence remains separate. This is complete backend-suite coverage, not complete notification browser/product acceptance.

The original paid-entry, Enterprise-cap and cancellation suites passed in both full phase A and full phase B after read-order changes. Publication passed within phase B as well; no claim is made that this proves all future transaction races impossible. Withdrawal coverage retained 216 assertions across all four capacities and both formats; correction/review retained 56 accounting and locked-policy assertions.

The ordinary `pnpm.cmd build` run was intentionally interrupted (exit 1) after its default `.next` output was found to contain historical generated verification directories. Do not describe that attempt as passed. A separate run uses the existing `CHALLENGE_SUITE_NEXT_DIST_DIR=.next/notification-verification-20261028` setting to isolate build output; no configuration source change was made for this purpose.

Detailed source inventory: `notification-source-inventory-2026-10-28.json` lists 39 intended modified/new implementation and test files, purposes and SHA-256 hashes. The broader tracked-path inventory includes preserved pre-existing generated changes; it is not a staging list. No files have been staged.

## Final local static/build checks

- `pnpm.cmd typecheck`: exit 0.
- `pnpm.cmd lint`: exit 0 (full project).
- `CHALLENGE_SUITE_NEXT_DIST_DIR=.next/notification-verification-20261028; pnpm.cmd build`: exit 0, optimized compilation, TypeScript and route generation completed. Next added its isolated output include paths to the already dirty local tsconfig; these machine-specific additions are preserved and excluded from any proposed release staging.
- `git diff --check`: exit 0. Line-ending normalization warnings are not whitespace-check failures.
- The existing unfiltered browser regression program was started separately after the successful build; its actual outcome is recorded below when complete. It does not include newly authored notification-specific journeys, which remain missing.

## Existing browser regression outcome

`node scripts/run-isolated-p0-emulators.mjs C:\Users\seyia\AppData\Roaming\npm\node_modules\firebase-tools scripts/qa/run-p1-browser-e2e.mjs` completed the default unfiltered browser program: **44/44 journeys passed, 393 assertions**. Sanitized results and screenshot references are in `notification-existing-browser-results-2026-10-28.json`. Raw authentication diagnostics remain private in the isolated temporary evidence directory and must not be committed.

Passed existing journeys include delayed account classification, Host logout/relogin, unsafe redirect rejection, stale identity response protection, Explore, publishing, private access, Sponsor/Enterprise authorized routes, Tournament submissions/votes/results, support and both Live Event flows. This default run does not execute opt-in `dashboard redesign`, `master acceptance` or newly required notification-specific acceptance. Do not label those missing groups passed. No new inbox/bell desktop/tablet/mobile screenshot acceptance has been established.

Release remains blocked by the missing notification feature/source coverage and acceptance cases listed above, in addition to deployed index readiness. No staging, commit, push or deployment was performed. All work and failure evidence remain preserved for continuation.
Browser process exit: 0. Source fingerprint stable: true. Default run skipped: 0; opt-in groups were not registered in this run. Screenshot references: 29 existing-journey images. Final whitespace check exit: 0.

## Subsequent notification completion continuation

The historical results above remain unchanged. See [notification-completion-release-acceptance-2026-10-28.md](notification-completion-release-acceptance-2026-10-28.md) for the completed voter/Sponsor/history/recovery work, three approved READY Production indexes, fresh 52-journey browser acceptance, retained failure evidence and current critical contention blocker. Historical 80/80 acceptance is not a substitute for the newer failing 81-suite run.
