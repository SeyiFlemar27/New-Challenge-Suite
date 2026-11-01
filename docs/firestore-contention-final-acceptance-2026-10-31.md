# Firestore contention final acceptance — October 31, 2026

## Status

Continuation of the October 28 investigation. Final local acceptance completed on November 1; see `firestore-contention-release-handover-2026-11-01.md`. No push or deployment is claimed by this pre-publication checkpoint. The earlier report and failure evidence are preserved.

## Verified findings and changes

The native mixed-read diagnostic reproduced `INVALID_ARGUMENT: Transaction is invalid or closed` on emulator 1.21.0 at round 43, callback attempt 2, querying participants after `getAll`. With the same Firestore SDK 7.11.6, official emulator 1.22.0 completed 200 rounds, including four correctly classified ABORTED errors handled by the unmodified SDK. This supports an emulator invalidation/error-classification incompatibility for this sequence, not a conclusive diagnosis of its internal Java implementation or proof of real-cloud concurrency.

The test-only toolchain is pinned and checksum-verified. Application SDK versions, transaction retry rules, concurrency assertions and financial algorithms are unchanged. An independent mixed-read/outside-write integrity control is included in the full backend inventory, now 82 suites. See the October 28 report for official sources, compatibility matrix and known emulator limitations.

Full regression also exposed a separate Admin refund input mismatch: legitimate generated Sponsor payment IDs can exceed the former 180-character limit. Validation now checks document-ID structure, valid UTF-8, the derived ledger byte limit and provider metadata length. Existing short provider idempotency keys are unchanged; keys exceeding Stripe's 255-character limit use a deterministic SHA-256 representation of the same refund case. No amount, authorization, confirmation, provider-success, accounting or historical-record rule is relaxed.

The payment-return regression deliberately generates a real Sponsor reference longer than 180 characters, rejects six malformed/oversized references, enforces provider key/metadata limits and preserves existing retry and ledger assertions. These are deterministic local provider fixtures, not live financial operations.

Sources: [Stripe idempotency limits](https://docs.stripe.com/api/idempotent_requests), [Stripe metadata limits](https://support.stripe.com/questions/metadata-limits?locale=en-GB), [Firestore document-ID constraints](https://firebase.google.com/docs/firestore/quotas).

## Failures retained

- Original 80/81 backend cancellation failure and native SDK reproduction remain in the October 28 notification report.
- Earlier emulator runs were intermittent; isolated passes were not treated as full acceptance.
- First expanded inventory run: 81/82; the Admin refund length mismatch failed.
- Interrupted follow-up: 80/82; an Enterprise Storage timeout and an incorrectly constructed long-reference fixture failed. The fixture now extends the actual idempotency-key input used to generate the payment ID.
- October 31 initial sandbox typecheck/lint could not access installed dependency files; outside-sandbox execution exposed a genuine TypeScript library incompatibility with `String.isWellFormed`. UTF-8 round-trip validation replaces that call without changing the project's library target.
- The first October 31 browser build failed on that TypeScript error: zero journeys executed. A later run spanning the final provider-bound edit cannot establish final-source acceptance even if its journeys pass.

## Preservation and release boundary

Authoritative root remains `C:\Dev\New-Challenge-Suite`, branch `main`, starting HEAD `8199cd7cc8ced7240ae03e805f24d8fd0c8ab9b6`. Fetch on October 31 confirmed origin/main `f6bcadb3f197d1a7f0f9341e340419775a781a9b`, with zero remote-only and three local-only commits. The master checkpoint, source preservation and documentation commits remain in ancestry. No history rewrite, reset, stash, cleanup, substitute branch or reference-worktree modification occurred.

Generated Next/TypeScript files, dependency caches, raw authentication reports, private cloud inventories, logs and recovery artifacts remain preserved locally and excluded from source staging. Previous legitimate source and sanitized evidence remain included in the existing preservation commits.

No Production writes, new indexes, Rules, provider configuration, scheduler activation or real payments are authorized by this investigation. The previously approved READY indexes require a final read-only recheck before any push. Existing Individual Tournament activation restrictions and D24/D27 holds remain mandatory.

## Final outcomes

Final November 1 source: backend 82/82; unfiltered browser 52/52 with 534 assertions; supplemental master 14/14 with 100 assertions; dashboard preservation 24/24 with 175 assertions. Native 200-round diagnostic and both 225-assertion publication repeats passed. Typecheck, full lint, fresh isolated production builds, whitespace and Git connectivity checks passed. The October 31 final-source attempts interrupted before completion are not counted as passes. Exact exit codes, source fingerprints and exclusions are retained in the November 1 handover evidence; actual Git publication/deployment outcomes belong to the final handover after publication.
