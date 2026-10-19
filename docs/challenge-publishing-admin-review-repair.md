# Challenge publishing and Admin review repair

## Final verification continuation — 2026-10-19

This section supersedes the earlier remaining Tournament editorial-approval blocker below. Historical failed runs remain recorded as historical evidence, not current passes.

- Tournament content approval no longer requires scheduling configuration. In production without scheduling readiness it persists canonical `scheduled` plus `reviewStatus: approved`, `publicationHoldReason: scheduler_unavailable`, and no publication timestamp. Public Tournament policy excludes held records, and existing registration/activation guards remain intact.
- Opening registration is a separate confirmed Admin action (`openRegistration: true`) through the existing review endpoint. It requires the held approved state, repeats readiness/media/funding checks, checks stale state, and creates its own idempotent audit decision. Merely retrying editorial approval cannot release the hold. The review center explains the hold and exposes this explicit action.
- Readiness here means the existing validated environment configuration gate, not a live IAM/queue/worker health probe. No production scheduling infrastructure was inspected, provisioned, enabled, or claimed verified. The successful release regression uses syntax-valid demo configuration only and never dispatches tasks.
- Creator notifications explain the scheduling hold and use the authenticated builder destination. The shared queue includes the hold in Admin details. No payment activation or payout permission is granted by review.
- The obsolete builder contract now checks automatic daily free voting and optional 5-DoroCoin additional votes. Product voting code was not reverted.
- Recovery snapshot `C:\Dev\Backups\New-Challenge-Suite\20261018T193931Z-publishing-repair` was independently rechecked: all 3,040 manifest hashes matched and its complete-history Git bundle verified. It preserves the original baseline, not subsequent repair edits. All 51 working-tree entries remain present; none is staged. No Git publication or live infrastructure operation was performed.

### Transaction investigation

The earlier failing logs show Firestore Emulator transaction lock timeouts preceding `INVALID_ARGUMENT: Transaction is invalid or closed`. A fresh isolated Normal paid-entry run passed 27 assertions and exited cleanly (`challenge-suite-p0-isolated-HbGSBf`). A separate isolated Tournament member-payment run passed 26 assertions, including concurrent duplicate confirmation, five teams competing for four slots, and duplicate expiry reconciliation (`challenge-suite-p0-isolated-h4bz9L`); its CLI subsequently exited 1 on shutdown timeout. Its emulator log contains recovered lock timeouts. These results do not establish a clean runner pass or prove that production transactions are defective. No financial source, retry policy, capacity assertion, or concurrency assertion was changed speculatively. Process inspection showed the owned verification process tree without a competing repository Next/test tree; unrelated Codex processes were preserved.

### Current verification evidence

- `node --experimental-transform-types --experimental-loader ./scripts/ts-alias-loader.mjs scripts/test-publishing-media-roundtrip.mjs`: 6 assertions passed. An initial invocation without the alias loader failed module resolution; the supported invocation passed.
- `node scripts/builder-phase1-contracts.mjs`, `node scripts/challenge-builder-publishing-deep-contracts.mjs`, and `node scripts/submit-review-firestore-contracts.mjs`: passed.
- Isolated actual publishing/Admin handlers: 497 assertions passed, clean exit 0 (`challenge-suite-p0-isolated-DvRYlu`). Covers Normal, Private, Tournament, Attendance Only and Physical Competition, authorization, repeated/conflicting decisions, review visibility/pagination/query errors, notification destinations, approval-dependent discovery, production-mode editorial hold and independently audited configuration-fixture release.
- `pnpm.cmd typecheck`, `pnpm.cmd lint`, and `git diff --check`: passed (Git reports existing CRLF normalization warnings).
- Full P0: **71/71 suites passed, clean exit 0**, `challenge-suite-p0-isolated-gikbrM/suite-results.json` and `execution.log`. Normal paid entry passed 27 assertions; Tournament member payments passed 26. The complete four Tournament lifecycle scenarios passed 424 assertions; Live Event admission passed 348; media publish handlers passed 33. The final publishing/Admin test reported 498 assertions in this populated run (497 in its standalone run; pagination scans include the other suites' records). Neither previous terminal paid-entry suite failure reproduced. The emulator log still contains 111 lock-timeout warning entries and 16 occurrences of the invalid/closed transaction text, recovered without assertion failure. This is current successful execution evidence, not a proven fix for the historical intermittent emulator failure. Emulator/SDK contention remains a reliability limitation; no speculative production financial change was made.
- Fresh isolated Next.js production build: passed, output `.next/e2e/484bbf16a6584ff88d21352318582974`; no existing development server was reused.
- Production-mode local browser suite: **25/25 journeys, 377 assertions, zero failures/skips, zero uncaught page errors; clean exit 0**. Evidence: `C:\Users\seyia\AppData\Local\Temp\challenge-suite-p0-isolated-yTtKfa\runtime-temp\challenge-suite-p1-browser-484bbf16a6584ff88d21352318582974\results.json`, with logs/screenshots in that directory. Actual Admin review controls were exercised; the five review journeys used real emulator media bytes and actual submission APIs. Dedicated builder journeys exercise browser upload controls. This does not claim every failure permutation or production external service was verified.

| Production-mode local publishing review journey | Result | Assertions |
| --- | --- | --- |
| Normal: submission, feedback, resubmission, approval | PASS | 19 |
| Private: submission, feedback, resubmission, approval | PASS | 19 |
| Tournament: submission, feedback, resubmission, editorial approval and public hold | PASS | 21 |
| Live Event Attendance Only: submission, feedback, resubmission, approval | PASS | 19 |
| Live Event Physical Competition: submission, feedback, resubmission, approval | PASS | 19 |

The Tournament public-access assertion deliberately sends no Admin cookies; authorized managers retain their inspection rights. No successful end-to-end production activation is claimed. Unattended Tournament execution still requires real validated Cloud Tasks/WIF/IAM/queue/worker/recovery configuration and its operational verification; this task neither bypasses nor activates it. Live email delivery and live provider behavior remain unverified. No current failing assertion remains in the executed scoped checks, but recovered emulator contention and the earlier shutdown timeout remain documented above.

Commands used for the two integrated runs:

```powershell
node scripts/run-isolated-p0-emulators.mjs C:\Users\seyia\AppData\Roaming\npm\node_modules\firebase-tools
node scripts/run-isolated-p0-emulators.mjs C:\Users\seyia\AppData\Roaming\npm\node_modules\firebase-tools scripts/qa/run-p1-browser-e2e.mjs
```

Continuation changes are limited to the existing Tournament Admin handler, shared Tournament public policy, unified review detail fields/UI, obsolete voting contract, publishing handler/browser tests, isolated suite whitelists, and this report. The complete 40-repair/11-artifact inventory below remains current. All changes remain unstaged on `codex/publishing-review-repair-20261018`, HEAD `883bbdeb51df8a5cbba46e497a9bdbd8297e79c9`; no commit, push, deployment, index/Rules publication, or live infrastructure alteration occurred.

Post-browser `pnpm.cmd typecheck` passed again, confirming generated route types remained valid. Final `git diff --check` returned 0; status remains 51 entries and the index is empty. The repair branch has no configured upstream (reported only; no Git configuration was changed).

## Scope and preservation

This is a local repair, not a release. No commit, push, deployment, Rules/index publication, production financial operation, or provider activation is authorized or performed.

- Repository: `C:\Dev\New-Challenge-Suite`, origin `SeyiFlemar27/New-Challenge-Suite`.
- Starting HEAD: `883bbdeb51df8a5cbba46e497a9bdbd8297e79c9` (published Live Event baseline).
- Authorized isolated repair branch: `codex/publishing-review-repair-20261018`.
- Verified recovery: `C:\Dev\Backups\New-Challenge-Suite\20261018T193931Z-publishing-repair`. Stable source and copied SHA-256 inventories, 3,040 entries, Git bundle and binary patches; sensitive local configuration remains restricted and is not reproduced here.
- All eleven pre-existing status entries are retained: `next-env.d.ts`, `tsconfig.json`, `tsconfig.tsbuildinfo`, `.pnpm-store/`, and seven `lint-*.json` artifacts. No reference worktree is modified.

## Evidence-backed diagnosis

| Area | Confirmed failure | Repair and evidence |
| --- | --- | --- |
| Normal and Private restored media | The request schema rejects the protected relative media URLs that publication itself persists. The publish validator also omitted the actual challenge ID, rejecting its immutable verified-media namespace. | Accept only the exact application delivery URL/path binding, preserve same-record verification scope, pass the persisted ID and media owner into validation. `test-publishing-media-roundtrip.mjs` reproduced the first failure before repair; actual handler tests verify replacement, restoration and resubmission. |
| Live Event | Uses the same challenge media/publish path and therefore inherits its restoration/verification defects. Its alternate create endpoint also committed the record before writing verification and ledger foundations. | Shared media repair; verification and financial foundation creation now share the create transaction. Both Attendance Only and Physical Competition are covered independently. |
| Tournament | Review submission freezes cover URL but leaves the draft path, making subsequent restoration/resubmission fail URL/path validation. | Freeze URL/path together; repair historical mixed pairs only from authoritative server verification metadata; recheck actual scoped object bytes. Actual handler tests reproduced the mismatch before repair. |
| Tournament missing approvals | Generic Admin review reads only `challenges`, while Tournament submissions live in `tournaments`. Dedicated listing also converts missing-index failures into successful empty queues. | Unified queue reads both canonical collections; dedicated Tournament and public discovery index failures are explicit 503 errors. No live index was created. |
| Concurrent/duplicate decisions | Multiple legacy decision paths calculate state separately and diverge on review/publication behavior. | One transactional challenge decision service, existing Tournament decision service, mandatory confirmation and rejection/change reasons, stale-state guards, deterministic decision/audit IDs and idempotent retry. |
| First-save retry | Live Event/Tournament creation uses random IDs; loss of the first response can duplicate a draft. | Authenticated, owner-scoped retry keys in those builders and creation endpoints; atomic create preconditions and concurrent recovery. Legacy callers without a key retain their existing create semantics. |
| Creator feedback | Rejection returning to draft hides feedback; Tournament review metadata is absent from restoration DTO. | Restore and display review reasons in Normal/Private, Live Event and Tournament builders. |
| Upload race | Tournament controls ignore the processing phase after upload. | Preparing/uploading/processing block progression, final submission and Finish Later until the upload resolves. |

These are reproducible local defects. They do not prove that every historical production report has exactly the same cause. No production write or live creator transaction was used to reproduce failures.

## Review architecture

`/api/admin/challenge-reviews` is the shared authenticated queue/detail/decision interface. `/admin/challenges` and `/admin/tournaments` use the same review center, with a Tournament preset where appropriate. Legacy challenge review actions delegate to this interface.

Existing challenge flag/archive/suspend/note and Tournament operational interfaces remain linked through `?view=operations`; the new approval queue does not remove those management tools.

- Filters: all pending, each type, approved, rejected, changes requested, draft and all states.
- Search: title, persisted creator name/ID and record ID. Creator profile identity is loaded for details.
- Pagination: stable document-ID cursors independently scan both collections; bounded scans expose continuation, including when a scanned page contains no matches. Sorting is by record ID, not by a misleading global date order.
- Details: submitted content, real media, verified creator identity, type-specific configuration, schedule, financial configuration and review history. Secrets such as invitation credentials are not included.
- Decisions: authenticated single-Admin permissions; self-review denied; reasons, explicit confirmation, idempotency, current-state checks, audit history and durable notifications.
- Approval preserves funding readiness, private discoverability, scheduled publication, Tournament activation and Live Event financial restrictions. It never approves a payment or creates a winner/payout.
- Historical pending challenge records missing a separate media-verification document can recover only after immutable object bytes are successfully reinspected. Embedded metadata alone cannot authorize approval.

## Data compatibility

Canonical `challenges` and `tournaments` records remain the source of truth. Existing draft/pending/approved lifecycle states are reused; revision and decision identifiers, review metadata, verification records, audit events and notification/outbox records are additive. No historical financial record is rewritten. No migration, Rules change, index definition change or production backfill is performed. Existing creation APIs remain compatible when no retry header is supplied; the repaired clients send owner-scoped retry keys explicitly.

## Public visibility and messages

Explicit pending/rejected/changes-requested review flags prevent public eligibility in standard discovery, locked Private previews, Tournament discovery/media and direct detail paths. Owner/Admin management views remain available under existing authorization. Previously published legacy records without review flags retain existing status semantics; no data backfill is performed.

Submission and decision notices are durably recorded with deterministic identifiers. Email work is queued through existing outboxes; provider acceptance and delivery are not claimed. Existing opt-in delivery and operational retry dependencies remain unchanged. A queued email is not a delivered email.

Review notifications use existing type-specific builder routes for pending/rejected/changes-requested work, and the proper detail route after approval. The invalid `/challenges/{id}/preview` destination and missing Tournament notification destinations are repaired. Enterprise Live/Tournament edit links retain official ownership context. The shared navigation helper is tested through persisted actual-handler notices.

## Verification ledger

Results below distinguish suite assertions from runner shutdown and browser/provider verification.

- Initial complete P0 execution: 71/71 suites passed in `C:\Users\seyia\AppData\Local\Temp\challenge-suite-p0-isolated-f4Fjt1\suite-results.json`; Firebase CLI then returned exit 1 on a shutdown timeout. This is not an unqualified runner pass.
- Focused actual handlers: 284 assertions passed and emulator runner exited 0 in `C:\Users\seyia\AppData\Local\Temp\challenge-suite-p0-isolated-ihcRs7`. This preceded the final additional retry/confirmation/recovery assertions; final results must be recorded separately.
- **Final focused actual-handler run: 375 assertions PASS, runner exit 0**, `C:\Users\seyia\AppData\Local\Temp\challenge-suite-p0-isolated-LjrnQr`. Covers all five variants, actual discovery APIs before/after decisions, concurrent creation retry keys, explicit confirmation, legacy media-verification recovery, restoration, replacement, all three Admin decisions, idempotency and conflicting concurrent decisions.
- **Expanded final actual-handler run: 385 assertions PASS, runner exit 0**, `C:\Users\seyia\AppData\Local\Temp\challenge-suite-p0-isolated-NDunPn`. Adds missing object, unowned media, required media missing, unauthorized/unauthenticated submission, concurrent same-draft submission with one revision, and recovery to successful publication after invalid attempts. Includes the final Admin detail field whitelist.
- **Final actual-handler run: 484 assertions PASS, runner exit 0**, `C:\Users\seyia\AppData\Local\Temp\challenge-suite-p0-isolated-D57HbO`. Includes all preceding cases plus 60-record queue pagination with no omissions/duplicates, API-level injected query failure returning 503, Tournament round-plan/format details, and valid persisted submission/decision notification destinations. Injection proves error mapping; it does not verify production index deployment.
- **Exact final production build PASS**: `CHALLENGE_SUITE_NEXT_DIST_DIR=.next/publishing-review-final-20261019 pnpm.cmd build`, after the final notification corrections. Compilation, TypeScript, and all 278 generated pages completed. An initial sandboxed attempt failed to fetch the existing Manrope font; the authorized network-enabled retry succeeded. Only this build's generated type includes/import were removed after checking against captured original configuration; the original dirty configuration and isolated build output remain preserved.
- Media round-trip: 6 assertions passed with the repository TypeScript alias loader.
- Typecheck and full ESLint both exited 0 after the final application changes.
- Actual media publish handlers: 33 assertions passed in the earlier focused demo execution.
- Full browser baseline after initial repairs: 20/21 journeys passed, 315 assertions; the new combined journey stopped on an unauthenticated Private detail assertion. Existing journeys passed, including real file-picker uploads and both Live Event builders.
- Corrected focused production browser run reached Tournament approval and was blocked by the existing `TOURNAMENT_SCHEDULING_UNAVAILABLE` guard. This is an external scheduling-readiness boundary, not permission to fabricate configuration or bypass the guard.
- Independent production-mode variants: Normal 19 assertions PASS, Private 19 PASS, Attendance Only 19 PASS, Physical Competition 19 PASS; Tournament stopped at approval (17 assertions reached), total 4/5 journeys and 93 assertions. Evidence: `C:\Users\seyia\AppData\Local\Temp\challenge-suite-p0-isolated-UMemLP\runtime-temp\challenge-suite-p1-browser-5f8bf2149a224b9987d5e10bbfd3c0d5\results.json`.
- A subsequent full P0 rerun passed 58 suites, then `test-tournament-member-payments-emulator.mjs` failed with Firestore Emulator `INVALID_ARGUMENT: Transaction is invalid or closed`. This failure is retained in `C:\Users\seyia\AppData\Local\Temp\challenge-suite-p0-isolated-e1Czq8\suite-results.json`; it does not invalidate or replace the earlier 71/71 assertion record, and is not reported as a successful final run.
- A serial full rerun also failed, after two passing suites, in the unchanged Normal paid-entry test with the same error. The Emulator log first records transaction lock timeouts. Evidence: `C:\Users\seyia\AppData\Local\Temp\challenge-suite-p0-isolated-IuTGGg\suite-results.json` and `firestore-debug.log`. The root cause is not conclusively isolated; do not describe the latest full regression as passing or remove concurrency assertions to hide it.
- Browser review variants are now independent so one blocked variant cannot suppress the other types. Development-mode verification is separately selectable for isolated local workflow testing; production remains the default.
- Tournament development-mode browser review subsequently passed 1/1 journey, 20 total assertions (19 in the journey), with clean emulator shutdown: `C:\Users\seyia\AppData\Local\Temp\challenge-suite-p0-isolated-d2w3wL\runtime-temp\challenge-suite-p1-browser-f9a13b2184a642dda68bf6baf6fea3ec\results.json`. It uses the real accessible login form after client hydration; this does not bypass or verify production scheduler readiness.
- Full production-mode browser rerun: **24/25 journeys PASS, 372 assertions, zero uncaught page errors**, isolated production build PASS; only failure is Tournament review approval's preserved scheduling guard. Evidence: `C:\Users\seyia\AppData\Local\Temp\challenge-suite-p0-isolated-ac7wG7\runtime-temp\challenge-suite-p1-browser-5b071d679e8d431283613f62576d3fe4\results.json`. The final additional Admin detail whitelist and notification destination changes are verified separately by the 484-assertion handler run and exact final build, not claimed as a subsequent full browser run.
- Deep builder publishing contracts, submission Firestore contracts and Live Event V2 contracts have been checked against current implementation rather than obsolete component names/post-commit notification assumptions.
- `builder-phase1-contracts.mjs` still contains superseded voting-label expectations (`Free Vote Only`); it is not reported as passing and no voting product policy is changed to satisfy it.
- Earlier browser harness failures were corrected with a unique Search submissions selector, waiting for actual image decoding, authenticated owner-detail requests, and hydrated login readiness in development. No authentication or media assertion was removed.
- Final standalone `pnpm.cmd typecheck`, full `pnpm.cmd lint`, and `git diff --check` all exited 0 after build cleanup. Git emitted line-ending notices, not diff-check failures. All repair files remain unstaged and uncommitted.

### Commands

```powershell
pnpm.cmd typecheck
pnpm.cmd lint
# Browser runner performs a fresh isolated production build by default.
node scripts/run-isolated-p0-emulators.mjs C:\Users\seyia\AppData\Roaming\npm\node_modules\firebase-tools
node scripts/run-isolated-p0-emulators.mjs C:\Users\seyia\AppData\Roaming\npm\node_modules\firebase-tools scripts/test-publishing-review-emulator.mjs
node --experimental-transform-types --experimental-loader ./scripts/ts-alias-loader.mjs scripts/test-publishing-media-roundtrip.mjs
node scripts/challenge-builder-publishing-deep-contracts.mjs
node scripts/submit-review-firestore-contracts.mjs
node --experimental-transform-types --experimental-loader ./scripts/ts-alias-loader.mjs scripts/test-live-event-v2-contracts.mjs
git diff --check
```

## Remaining boundaries

- Production-mode Tournament approval must remain unavailable unless existing durable scheduling readiness is verified. This repair does not configure or activate that infrastructure.
- Emulator and local browser evidence do not verify production Storage/IAM, production indexes, live email delivery, scheduler execution or payment-provider behavior.
- Media fixtures cover real stored bytes and actual handler validation; not every browser failure permutation (expired session, interrupted upload, all device/codec combinations) is end-to-end verified.
- Document-ID pagination avoids adding a new index dependency but performs bounded scans; very large datasets may require repeated Next page actions. No claim of global submitted-date sorting is made.
- Existing legacy create clients that omit retry keys can create distinct drafts. Supported restored draft submission and the repaired Live Event/Tournament first-save clients have explicit retry handling.
- No publication should occur from this worktree until the user reviews the final report and authorizes it.
- Final intended source changes comprise 40 repair/application/test/documentation entries, including new untracked files; eleven pre-existing local artifact entries remain preserved (51 total status entries). No files are staged.

## Working-file inventory

All entries are uncommitted and unstaged. Original artifacts are retained, excluded from any proposed publication; no staging or publication is performed here.

| Status | Path | Classification |
| --- | --- | --- |
| M | `app/admin/[section]/page.tsx` | Publishing/review application repair |
| M | `app/admin/review/page.tsx` | Publishing/review application repair |
| M | `app/api/admin/operations/route.ts` | Publishing/review application repair |
| M | `app/api/admin/reviews/route.ts` | Publishing/review application repair |
| M | `app/api/admin/tournaments/[id]/route.ts` | Publishing/review application repair |
| M | `app/api/admin/tournaments/route.ts` | Publishing/review application repair |
| M | `app/api/challenges/[id]/publish/route.ts` | Publishing/review application repair |
| M | `app/api/challenges/[id]/route.ts` | Publishing/review application repair |
| M | `app/api/challenges/route.ts` | Publishing/review application repair |
| M | `app/api/explore/challenges/route.ts` | Publishing/review application repair |
| M | `app/api/tournaments/[id]/route.ts` | Publishing/review application repair |
| M | `app/api/tournaments/route.ts` | Publishing/review application repair |
| M | `components/host/live-event-builder-v2.tsx` | Publishing/review application repair |
| M | `components/normal-challenge-builder.tsx` | Publishing/review application repair |
| M | `components/tournament-builder.tsx` | Publishing/review application repair |
| M | `lib/api/services.ts` | Publishing/review application repair |
| M | `lib/server/challenge-media-delivery.ts` | Publishing/review application repair |
| M | `lib/server/challenge-review-submission.ts` | Publishing/review application repair |
| M | `lib/server/challenge-validation.ts` | Publishing/review application repair |
| M | `lib/server/media-storage-validation.ts` | Publishing/review application repair |
| M | `lib/server/media-verification-errors.ts` | Publishing/review application repair |
| M | `lib/server/public-challenge.ts` | Publishing/review application repair |
| M | `lib/server/tournament-media-verification.ts` | Publishing/review application repair |
| M | `lib/server/tournament-operations.ts` | Publishing/review application repair |
| M | `lib/server/tournament-public-policy.ts` | Publishing/review application repair |
| M | `lib/server/tournament-validation.ts` | Publishing/review application repair |
| M | `next-env.d.ts` | Pre-existing local artifact; preserve |
| M | `scripts/builder-phase1-contracts.mjs` | Regression test or isolated test runner |
| M | `scripts/challenge-builder-publishing-deep-contracts.mjs` | Regression test or isolated test runner |
| M | `scripts/qa/run-p1-browser-e2e.mjs` | Regression test or isolated test runner |
| M | `scripts/run-isolated-p0-emulators.mjs` | Regression test or isolated test runner |
| M | `scripts/run-local-verification-suite.mjs` | Regression test or isolated test runner |
| M | `scripts/run-p0-emulator-regressions.mjs` | Regression test or isolated test runner |
| M | `scripts/submit-review-firestore-contracts.mjs` | Regression test or isolated test runner |
| M | `tsconfig.json` | Pre-existing local artifact; preserve |
| M | `tsconfig.tsbuildinfo` | Pre-existing local artifact; preserve |
| ?? | `.pnpm-store/v11/index.db` | Pre-existing local artifact; preserve |
| ?? | `app/api/admin/challenge-reviews/route.ts` | Publishing/review application repair |
| ?? | `components/admin/challenge-review-center.tsx` | Publishing/review application repair |
| ?? | `docs/challenge-publishing-admin-review-repair.md` | Repair evidence and inventory |
| ?? | `lib/server/challenge-admin-review.ts` | Publishing/review application repair |
| ?? | `lint-batch5b-baseline.json` | Pre-existing local artifact; preserve |
| ?? | `lint-batch5b-current.json` | Pre-existing local artifact; preserve |
| ?? | `lint-batch5b-group2.json` | Pre-existing local artifact; preserve |
| ?? | `lint-batch5b-progress.json` | Pre-existing local artifact; preserve |
| ?? | `lint-batch5b-progress2.json` | Pre-existing local artifact; preserve |
| ?? | `lint-batch5b-targeted.json` | Pre-existing local artifact; preserve |
| ?? | `lint-escaping-targeted.json` | Pre-existing local artifact; preserve |
| ?? | `scripts/test-publishing-media-roundtrip.mjs` | Regression test or isolated test runner |
| ?? | `scripts/test-publishing-review-emulator.mjs` | Regression test or isolated test runner |
| M | `lib/notification-navigation.ts` | Type-specific review notification destinations |
