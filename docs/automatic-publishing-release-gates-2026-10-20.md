# Automatic publishing release gate inspection — 20 October 2026

Status: **STOPPED before commit or push. Production was not updated.**

## Verified identity and preservation

- Root: `C:\Dev\New-Challenge-Suite`.
- Branch: `codex/automatic-publishing-exception-moderation`; no upstream.
- HEAD and freshly checked remote `main`: `4e0c5cee1c012361f492fd37a50518194fd909d6`.
- Origin: `https://github.com/SeyiFlemar27/New-Challenge-Suite.git`.
- Existing implementation remains uncommitted. No files were staged or committed.
- Both historical worktrees remain listed and untouched.
- Recovery: `C:\Users\seyia\AppData\Local\Temp\challenge-suite-auto-publish-recovery-c4RtLq`. Git bundle verification passed. All 3,047 captured files, 29,051,794 bytes, matched their recorded SHA-256 hashes; zero mismatches.
- Current `.env.local`, original dirty `next-env.d.ts` and `tsconfig.json`, package/lock files, and Rules files match recovery hashes. No private values were output.

## Critical gate: production Storage not verified

Two read-only checks using the configured `challenge-suite` service-account credential attempted the bucket IAM `testPermissions` operation for `storage.objects.get`, `storage.objects.create`, `storage.objects.update` and `storage.objects.delete`.

Both failed during credential-fetch transport with `ERR_STREAM_PREMATURE_CLOSE` and `Invalid response body ... Premature close`. This is not evidence that IAM denied those permissions. No object was uploaded, modified or deleted. Mandatory decoding/canonical-copy verification and secure Firebase download-token revocation therefore remain unverified against live production Storage. Local emulator success does not satisfy this gate.

Smallest next step: restore reliable authenticated access for the intended production credential and retry the read-only permission check. Then establish a narrowly scoped, reversible synthetic-media verification in the release environment, including token revocation and cleanup, without touching creator objects or publishing a challenge. Do not weaken the verifier or grant broader permissions based solely on this transport failure. A successful IAM test alone would still not prove the complete byte-verification/token-revocation pipeline.

## Critical gate: missing Tournament Explore indexes

The read-only Firebase CLI inventory returned 18 production composite indexes and **zero for `tournaments`**. The inventory is preserved locally as `automatic-publishing-production-indexes.json` and is not an application release file. The local manifest has 82 definitions; after normalizing implicit document-ID ordering, 64 are absent from production. That difference is not a proposal to deploy all 64: each release-relevant query must be mapped individually.

Confirmed new Explore query in `app/api/explore/challenges/route.ts` filters `privacy == public` and orders by the selected sort field plus document ID. The following collection-scope indexes are absent:

| Collection | Fields in order |
| --- | --- |
| tournaments | privacy ASC, createdAt DESC, __name__ DESC |
| tournaments | privacy ASC, createdAt ASC, __name__ ASC |
| tournaments | privacy ASC, participantCount DESC, __name__ DESC |

The locally defined registration-recovery index is also absent: `status ASC, publicationPolicyVersion ASC, registrationHoldReason ASC, __name__ ASC`. Its query is in `lib/server/tournament-publication.ts`. Scheduling infrastructure is explicitly deferred; no Cloud Tasks provisioning, activation, health manipulation or Admin bypass was attempted. Recovery-index applicability can be reviewed separately from the three publication-discovery indexes.

No indexes were created, deleted or replaced. A concrete strictly additive index plan needs explicit authorization and READY verification before dependent application code is released. Never deploy the complete manifest blindly.

## Vercel and remaining verification

The authenticated CLI resolved `challenge-suite` under `seyiflemar27s-projects`, ID `prj_RuZ2HwHUfOxCubMH1EfvB4Bkm6RX`, intended team `team_Aof3F7rzekkBNGBsPb6p9XmO`, root `.`, Next.js, Node 24.x. The connector inspection returned a not-found error; CLI resolution succeeded. No deployment was initiated.

Production environment-key completeness/value linkage, complete deployed Firestore Rules compatibility, deployed Storage Rules compatibility, current rollback deployment identity/domain assignment, exact release-diff review and all-file inspection are not yet certified. Retrieving deployed Storage Rules is not by itself a compatibility test.

`git diff --check` passed with line-ending notices. The final regression/build/browser suite was **not rerun in this release attempt**, because the mandatory production Storage gate failed. The implementation audit records prior 71/71 regression success, five primary production browser journeys, aggregate success for ten relevant browser cases, and 15 other browser journeys not executed. Those are historical local results, not new release-candidate or live-provider verification. The remaining browser cases still need review and release-critical execution after prerequisites are resolved.

## Resume and rollback requirements

1. Resolve and verify authenticated Storage access and the real media/token pipeline.
2. Review the complete release query/index matrix; obtain explicit approval for only the required additive indexes and wait for READY.
3. Complete environment/Rules/authorization review, exact diff inspection and all required fresh tests, including the previously unexecuted release-critical browser cases.
4. Before any Production push, capture the independently verified current READY Production deployment, exact source SHA and domain assignments as the rollback reference. The recorded Git base alone is not a verified deployment rollback target.
5. Commit explicit intended files on the existing implementation branch, push without force, verify Preview, integrate safely into main and use the existing Git-connected Production deployment only after all gates pass.
6. Verify exact deployed commit, READY, production domain, safe nonfinancial smoke tests and errors. If a critical regression appears, restore the verified prior deployment as appropriate; application rollback does not reverse database/provider effects or financial/audit records.

Release commit: none. Files committed: none. Preview/Production deployment: none. Domain and post-deployment smoke verification: not performed. No production migration, historical auto-publication, financial operation, Rules/index deployment or scheduling-infrastructure change occurred.
