# Bounded runtime verification boundary

Release addition, not evidence of a live test. The existing competition engine is unchanged. The transport verifier never calls that engine, production recovery, registrations, financial services or readiness updates. Actual competition engine scenarios remain covered separately by demo Firebase lifecycle tests.

## Authentication and scope

`POST /api/admin/tournament-runtime-verification` accepts either a recently authenticated existing Admin with challenges.review, or the exact existing Google worker identity validated by the normal issuer/audience/email-verification checks. The Google identity obtains no general Admin access. Every operation requires a reason. Mutating/status requests record a standard synthetic operational audit entry; the permission-only access operation writes no readiness. No public debugging bypass, request-supplied credential or new service account is introduced.

The server generates `release-probe_<UUIDv4>` identifiers. The only test-state Firestore path is `tournamentRuntimeVerification/<exact-id>`. No collection enumeration exists. Records expire logically after 30 minutes; cleanup explicitly deletes only that exact marked synthetic document. Late deliveries cannot recreate it. A maximum of four dispatch attempts is recorded per synthetic worker job. Stable Cloud Tasks IDs deduplicate repeated enqueue. Recovery task IDs have a separate reserved suffix, so recovery can enqueue the distinct worker task.

The ordinary authenticated worker and reconciler now fail closed while either scheduler flag is disabled. Reserved synthetic worker/recovery requests return before all broad scans, global outbox dispatch and production registration recovery. A malformed reserved ID stays inside the diagnostic branch and cannot fall through to ordinary processing. Authorized cron GET is also disabled while scheduling is disabled. The flags are execution guards in these handlers as well as registration gates; they still do not prove runtime health or replace activation acceptance.

## Isolated evidence

`scripts/test-tournament-runtime-verification-emulator.mjs` executes against demo Auth/Firestore only. A capability-restricted database adapter rejects any collection name other than tournamentRuntimeVerification and any transaction reference outside an exact reserved synthetic document. Tests cover unauthorized and ordinary-user rejection, actual Admin creation/cleanup, disabled cron, early delivery, stale versions, failed dispatch and exact-ID recovery, concurrent duplicate transition, one requested retry, and cleanup/late delivery. The actual Admin route uses demo Auth identities; no production Admin account is created or impersonated.

Standard Admin audit entries are intentionally retained by the application; synthetic test records are removed. The capability adapter covers the worker/recovery data functions, while route authentication independently reads the authenticated synthetic user's profile and writes its operational audit. These are explicit test artifacts, not production competition access.

## Approved live execution plan after deployment gates

Keep both flags false and production recovery Scheduler PAUSED. Use at most two server-generated verification records and at most four distinct Cloud Tasks in the existing dedicated queue. Use the existing invoker's short-lived Google OIDC token (or existing recently authenticated Admin); keep it in process memory and never log/persist it. Confirm exact project, READY commit, endpoint, queue and audiences before invocation. If the caller cannot mint/use the intended identity with existing permissions, stop; do not add IAM grants.

1. Reject anonymous/invalid-token requests without writes.
2. Call action access; verify actual Vercel OIDC/WIF/impersonation and queue task-create permission, without setting readiness.
3. Create first synthetic record. Schedule action recovery, which sends a synthetic-only request to the actual reconciler URL/audience. Its exact-ID branch enqueues the worker and returns before global reconciliation. Observe exactly one transition and captured task identifier.
4. Create second record with retryOnce true; dispatch it. Its first due delivery deliberately returns 503 once, atomically records that test attempt, and its retry completes with transitions=1 and attempts=2. This behavior applies only to the reserved synthetic verifier.
5. Repeat delivery with the same version to prove no duplicate transition; verify stale versions and invalid identities/audiences remain harmless using only synthetic requests.
6. Read sanitized status, then cleanup each owned synthetic record. Verify absence and bounded task completion; never delete unrelated queued tasks. Retain synthetic audit evidence and sanitized test outcomes.

This plan verifies deployed transport, identity, real delivery/retry and isolated dispatch recovery. It does not prove the production-wide Scheduler has executed, production engine progression, financial provider readiness or operational alert delivery. The actual Scheduler job remains paused throughout. Final activation requires those separate gates and reviewed production backlog. No provider payment, real Tournament, creator-owned media or production competition deadline is altered.
