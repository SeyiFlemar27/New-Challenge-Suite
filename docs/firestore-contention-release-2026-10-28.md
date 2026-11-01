# Firestore contention investigation and release verification — 2026-10-28

## Scope and preservation

Authoritative root: `C:\Dev\New-Challenge-Suite`, branch `main`. Starting HEAD `8199cd7cc8ced7240ae03e805f24d8fd0c8ab9b6`; refreshed origin/main `f6bcadb3f197d1a7f0f9341e340419775a781a9b`. The unpublished commits `ccf39f987a1bea52bad13f4090bf5ff6ea29e7c5`, `7592ef44d3d3a5a10a42c8c7f07159af538c7e7f`, and `8199cd7cc8ced7240ae03e805f24d8fd0c8ab9b6` remain in ancestry. No reset, stash, clean, history rewrite, replacement branch or reference-worktree modification was performed. The existing recovery bundle verified successfully and records complete history at the remote baseline.

The initial source inventory was reconciled by SHA-256: 646 previously included files were unchanged. Differences at that checkpoint were the self-referential inventory and four deliberately modified diagnostic/runner scripts. Subsequent full verification exposed an Admin refund-reference validation mismatch, documented in `firestore-contention-final-acceptance-2026-10-31.md`. Notification, dashboard, Explore and Detail code remains preserved. Generated Next/TypeScript state remains a preserved local exclusion.

## Supported root-cause finding

The native SDK diagnostic uses no Challenge Suite services. The baseline emulator 1.21.0 failed at zero-based mixed-read round **43**, worker A, callback attempt **2**, during `query participants` after successful `getAll(shared, participant)`. It returned code **3 INVALID_ARGUMENT: Transaction is invalid or closed**. The native transaction runner does not retry this error: its specific INVALID_ARGUMENT retry allowance concerns an expired-transaction message, not arbitrary invalid arguments.

With the **same installed Firestore SDK 7.11.6**, emulator **1.22.0** returned code **10 ABORTED: The referenced transaction has expired or is no longer valid** at that same read stage during rounds 10, 43, 129 and 165. The unmodified SDK retried those transactions and all **200 rounds** completed with the existing exactly-once counter and refund assertions. This isolates the release-blocking behavior to the older emulator's transaction invalidation/error classification in this tested sequence. It does not establish the internal Java lock-manager mechanism or prove live Production contention behavior.

The earlier short baseline samples passed 20 rounds each three times, and the existing cancellation test also passed once. A full baseline invocation then failed in Normal paid-entry query handling after five successful suites; it stopped after suite six and is explicitly **not a complete run**. A subsequent complete baseline run passed 81/81. These outcomes demonstrate intermittency; the passing baseline run does not erase the failures. The native 200-round baseline failed as described above.

## Controlled compatibility matrix

All writes were to unique `demo-*` projects on loopback emulators. Node **24.17.0**, Temurin Java **21.0.12.1+1-LTS**. No cloud contention writes, real provider transactions, SDK internal patches, application retry additions, reduced concurrency or weakened assertions occurred.

| Configuration | Native diagnostic | Actual cancellation | Complete backend |
|---|---|---|---|
| CLI 15.22.4 / emulator 1.21.0 / SDK 7.11.6 | Three 20-round passes; 200-round run failed at round 43 | 323 assertions pass | One early-aborted failure; one later 81/81 pass |
| CLI 15.34.1 / emulator 1.22.0 / SDK 7.11.6 | 20-round pass; 200-round pass including four native ABORTED recoveries | 323 assertions pass | Two complete 81/81 passes before adding the integrity control |
| CLI 15.22.4 / emulator 1.21.0 / temporary SDK 9.4.0 | 20-round pass | Temporary matched Admin 14.5.0/SDK 9.4.0: 323 assertions pass | Not run; no application dependency upgrade selected |

The SDK comparison used an official installation under the OS temporary directory. The actual cancellation comparison redirected all Admin imports together through a demo-only temporary loader, avoiding mixed SDK object types. Project/global package versions and lockfiles were not changed.

Initial newer-emulator download failed with a terminated HTTP stream; an outside-sandbox retry completed. An initial SDK comparison could not start its local port. Later mixed-CLI runs exposed the CLI's shared cache cleanup: one version attempted to delete the other version's binary. Those startup failures are retained, not counted as application assertion failures. Subsequent runs used separate versioned caches. No test timeout or transaction retry limit was increased.

Official binary SHA-256:

- 1.21.0: `c3d3680a89d946a90a027365ea14c26c6472a162bcf37f099bbb1ebd66d25e8e`
- 1.22.0: `9b6498b7f62714d67f48f59b3818883cd682dbcd46b9f59511de81c97bb5166c`

## Integrity control and limits

[Firebase documents incomplete emulator transaction fidelity](https://firebase.google.com/docs/emulator-suite/connect_firestore#transactions). [SDK retry classification](https://github.com/googleapis/nodejs-firestore/blob/main/dev/src/transaction.ts) remains unchanged. [Upstream issue 11241](https://github.com/firebase/firebase-tools/issues/11241) reports a separate mixed-read/outside-write conflict-detection regression in 1.22.0; [issue 11160](https://github.com/firebase/firebase-tools/issues/11160) reports a separate batchWrite lock timeout. Neither is claimed as the cause of this application's failure.

An independent conflict-integrity control adapted from issue 11241 passed on both tested emulators with this project's SDK: the outside write had not committed before the first transaction commit was issued. It is now an additional required backend suite. This is a bounded local control, not proof that the upstream issue is resolved for every SDK/platform/query shape. No Production application dependency was upgraded. Real cloud contention acceptance remains unverified.

## Reproducible verification tooling

`scripts/firebase-emulator-toolchain.json` pins CLI 15.34.1, Firestore emulator 1.22.0 and SDK 7.11.6. `scripts/run-verified-emulator-suite.mjs` verifies the official manifest and cached binary checksum, rejects mismatched versions, removes diagnostic SDK/binary overrides and uses a separate versioned cache. It delegates to the existing unique-project isolation harness and records all suite outcomes. `scripts/test-firestore-transaction-runtime-emulator.mjs` adds per-attempt read-stage diagnostics and optional bounded 20–200 rounds, preserving the original minimum and assertions. The independent conflict control is included in the complete backend inventory, now **82 suites**.

Install the test-only CLI in a temporary directory with `npm install --prefix <temporary-directory> --ignore-scripts --no-audit --no-fund --save-exact firebase-tools@15.34.1`. Run `node scripts/run-verified-emulator-suite.mjs <temporary-directory>/node_modules/firebase-tools`; append an existing allowed selected script for targeted acceptance. No global install or application dependency change is required.

## Infrastructure and release boundary

Read-only reinspection confirmed the three approved notification indexes and existing history index remain READY. Query Explain with `analyze:false` planned every required notification query without document-query execution or writes. Evidence: `contention-resolution-2026-10-28/notification-index-states.json` and `notification-index-recheck.json`.

Vercel connector access returned 404; the existing local CLI successfully confirmed project `prj_RuZ2HwHUfOxCubMH1EfvB4Bkm6RX`, repository `SeyiFlemar27/New-Challenge-Suite`, Production branch `main`, and current READY deployment `dpl_DtepZCxm8w1hXGDYmmYZmQy5zuf5` at remote baseline SHA with the intended domains. Tournament activation and match schedulers are false. The pre-existing Normal lifecycle scheduler is true and unchanged; automatic refunds remain false. Raw account inventories remain excluded; sanitized evidence is `production-before.json`.

Unfinished Individual Tournament creation/registration, D24/D27 holds, provider boundaries and financial release protections remain unchanged. Emulator acceptance does not verify live email, Stripe, payouts, scheduling dispatch or authenticated Production accounts. No additional Firebase infrastructure change is part of this release.

## Final acceptance and Git outcome

Pending final suite completion and release reconciliation. No push has been performed at this report checkpoint. Exact run results (including setup failures and incomplete runs), traces, hashes and prior unpublished-file inventory are preserved under `contention-resolution-2026-10-28/`.
