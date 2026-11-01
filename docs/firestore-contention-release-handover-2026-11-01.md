# Challenge Suite release handover — November 1, 2026

This report records the reviewed local release candidate before the authorized direct `origin/main` push. The final chat handover records the resulting commit, remote SHA and automatic Vercel deployment; those outcomes cannot be assumed before publication.

## Resolution

The original native transaction failure reproduced on Firestore emulator 1.21.0 with SDK 7.11.6: a participant query after `getAll`, on the second transaction callback, returned non-retryable code 3 (`Transaction is invalid or closed`). The same SDK with official emulator 1.22.0 returned retryable code 10 for the corresponding invalidation condition. A 200-round comparison and a fresh November 1 200-round run passed without application retries. The fresh run recovered one native ABORTED condition at round 161. Exactly-once counter/refund assertions and actual financial concurrency tests remain intact.

This establishes a supported local compatibility configuration for the tested sequence. It does not establish the internal emulator lock-manager mechanism, resolve every upstream emulator limitation or prove Production financial concurrency. An independent outside-write conflict-integrity control also passes and is now required in the full regression inventory. Details, official references and all failed/interrupted runs are preserved in [the investigation](firestore-contention-release-2026-10-28.md) and [the continuation record](firestore-contention-final-acceptance-2026-10-31.md).

The full regression exposed a separate input-contract defect: generated Sponsor contribution references can exceed the Admin refund route's former 180-character maximum. The route now validates well-formed UTF-8, single-document-ID structure, derived ledger size and provider metadata limits. Existing valid provider retry keys remain identical; overlength keys use a deterministic SHA-256 representation of the refund case. No payment amounts, authorization, confirmation requirements, result verification, accounting or existing records are changed.

## Changed source and tooling

| File | Purpose |
| --- | --- |
| `app/api/admin/refunds/route.ts` | Accept valid generated payment references safely; enforce document/provider bounds and deterministic overlength retry keys. |
| `scripts/test-payment-return-routes.mjs` | Exercise a real generated reference longer than 180 characters, invalid IDs, provider bounds and existing retry/accounting safeguards. |
| `scripts/test-firestore-transaction-runtime-emulator.mjs` | Per-attempt read-stage tracing and bounded 20–200-round diagnostics; original assertions retained. |
| `scripts/test-firestore-conflict-integrity-emulator.mjs` | Independent mixed-read/outside-write conflict control. |
| `scripts/firebase-emulator-toolchain.json` | Exact test CLI, emulator, SDK and official binary checksum pins. |
| `scripts/run-verified-emulator-suite.mjs` | Verify toolchain/cache, reject diagnostic overrides and run isolated suites with complete exit accounting. |
| `scripts/run-isolated-p0-emulators.mjs`, `scripts/run-local-verification-suite.mjs` | Allow the new integrity control in the existing demo-only harness. |
| `scripts/run-p0-emulator-regressions.mjs` | Add the integrity control to the complete inventory, now 82 suites. |
| `docs/contention-resolution-2026-10-28/` and this investigation's reports | Sanitized results, source reconciliation, traces, read-only infrastructure evidence and screenshots. |

No application dependency or lockfile upgrade was made. Node 24.17.0, Java Temurin 21.0.12.1, Firebase CLI 15.34.1, Firestore SDK 7.11.6 and emulator 1.22.0 were used. The test-only CLI is installed outside the project under the OS temporary directory. Binary SHA-256 is recorded in the toolchain manifest.

## Verification

| Check | Final result |
| --- | --- |
| Complete backend inventory | 82/82 suites, exit 0; every suite executed. |
| Native mixed-read diagnostic | 200/200 rounds, exit 0; no application retry. |
| Concurrent automatic publication repeatability | Two fresh isolated runs, 225 assertions each, both exit 0. |
| Complete unfiltered browser regression | 52/52 journeys, 534 assertions, exit 0; zero skips/page errors; stable source fingerprint. |
| Notification-specific browser coverage | Included in the unfiltered run: 8 journeys, 141 assertions across all six roles. |
| Supplemental master browser acceptance | 14/14 selected journeys, 100 assertions, exit 0; 26 unrelated journeys filtered; stable source fingerprint. |
| Dashboard preservation | 24/24 selected journeys, 175 assertions, exit 0; 26 unrelated journeys filtered; stable source fingerprint. |
| TypeScript / full ESLint | Both exit 0 on the final application source. |
| Production build | Fresh isolated optimized webpack build passed before each successful browser run. |
| Whitespace / Git connectivity | `git diff --check` and `git fsck --connectivity-only --no-dangling`: exit 0. |
| Production index compatibility | All 15 required query plans succeed with `analyze:false`; zero document queries or writes. Three approved composites and existing history index are READY. |

Commands and per-suite exit codes are recorded in `final-command-results-20261101.json` and `run-matrix-final.json`. The exact command prefix is `node scripts/run-verified-emulator-suite.mjs C:\Users\seyia\AppData\Local\Temp\challenge-suite-contention-official-20261028\node_modules\firebase-tools`; append the selected script for targeted runs. Supplemental browser filters are explicitly recorded and do not replace the unfiltered run.

Earlier failures remain visible: original 80/81 cancellation failure; intermittent old-emulator runs; 81/82 refund-ID failure; 80/82 interrupted follow-up with a Storage timeout and incorrect fixture; TypeScript/build failure from `String.isWellFormed`; sandbox dependency-access failures; source-changing browser run; and runtime-interrupted runs without completion codes. None is reported as a pass.

## Visual and security preservation

Fresh evidence includes 56 unfiltered screenshots, 40 supplemental master screenshots and 26 dashboard-preservation screenshots. Notification screenshots cover six roles at desktop, tablet, mobile and empty states, plus retrieval errors, filtering and account switching. Browser assertions verify privacy, recipient isolation, preferences, read states, navigation and role restrictions. Fresh Sponsor mobile and Admin desktop notification screenshots were also visually inspected. No dashboard or Challenge Detail redesign was introduced by this fix.

The complete backend retains financial, payment, refund, Tournament, D24/D27 hold, Sponsor/Enterprise isolation, Admin authorization and media-privacy checks. Production Firestore Rules and Storage Rules are unchanged relative to origin/main. The only index-definition additions are the three previously approved, already READY notification composites.

## Complete local-to-remote accounting

Starting local main is `8199cd7cc8ced7240ae03e805f24d8fd0c8ab9b6`; origin/main was refreshed at `f6bcadb3f197d1a7f0f9341e340419775a781a9b`. Three preserved commits are included in the intended integration:

- `ccf39f987a1bea52bad13f4090bf5ff6ea29e7c5` — master implementation checkpoint.
- `7592ef44d3d3a5a10a42c8c7f07159af538c7e7f` — notification completion and source preservation.
- `8199cd7cc8ced7240ae03e805f24d8fd0c8ab9b6` — acceptance documentation.

The prior integration contains 827 changed paths. The new correction and sanitized evidence are additional explicit staging candidates. `local-reconciliation-20261101.json` records path-level inclusion/exclusion reasons and hashes. Earlier source-preservation inventory is retained. No ignored source was found under app, components, lib, hooks, scripts, public or docs. A high-confidence credential scan of the integration's text files found no matching live keys/private keys/bearer tokens; this supplements deliberate review rather than proving absence of all sensitive data.

Preserved exclusions: generated `next-env.d.ts`, isolated-build additions in `tsconfig.json`, `tsconfig.tsbuildinfo`, dependency caches, temporary logs and exit files, raw authentication/browser diagnostics, private cloud/Vercel inventories, historical staging/scan inventories, and recovery metadata. No legitimate application source is intentionally omitted. No reset, stash, clean, force push, history rewrite, new development branch, routine backup or reference-worktree change occurred.

## Production safety and external limits

Verified Vercel project: `prj_RuZ2HwHUfOxCubMH1EfvB4Bkm6RX` / `challenge-suite`, repository `SeyiFlemar27/New-Challenge-Suite`, Production branch main, domains `www.challengesuite.com` and `challengesuite.com`. Previous READY deployment: `dpl_DtepZCxm8w1hXGDYmmYZmQy5zuf5`, commit `f6bcadb3f197d1a7f0f9341e340419775a781a9b`.

Tournament activation and match lifecycle schedulers remain disabled. Normal automatic refunds and external email delivery gates remain disabled or unconfigured. The pre-existing Normal lifecycle scheduler is enabled and unchanged. New Individual policy creation is not enabled: the existing creation projection remains configVersion 3. D24/D27 scoped holds and provider-release safeguards remain intact. Existing Vercel configuration disables only the historical checkpoint branch; main's automatic Git deployment remains the intended release path. No repository GitHub Actions workflow directory is present.

No cloud contention test, real payment, external payout, infrastructure mutation or manual deployment was performed by this investigation. Local acceptance does not prove live Stripe/email delivery, authenticated Production account journeys, provider dispatch or real Standard-database contention. Those remain external acceptance limits; unverified new-policy/provider functionality remains fail-closed. No separate staging environment acceptance is claimed.

All required local verification runs have completed successfully. The final push remains conditional on the last staged-file and remote-history review. Only the automatic Git deployment may publish this candidate. The final handover must separately state commit, push, remote reconciliation and deployment outcomes; a created deployment alone is not release completion.
