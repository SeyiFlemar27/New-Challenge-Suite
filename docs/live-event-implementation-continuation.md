# Live Event implementation — current run

## Preservation

- Baseline: `ac83cdb1b7ae9e29e04f980682f03d5b8d636948`, source `C:\Dev\New-Challenge-Suite`.
- Isolated branch: `codex/live-event-complete-20261017`; no commit, push or deployment authorized in this run.
- Recovery: `C:\Dev\Backups\New-Challenge-Suite\20261017T191633Z-verified-publication`.
- Verified 2,967 tracked/untracked source/artifact files, before/after stable inventories, independent copied-file hashes, Git bundle and patches. Three ignored local configuration files separately hash-verified under inherited restricted snapshot ACLs. Dependency installations and regenerable ignored build output are not source recovery evidence.
- Existing eleven status entries remain untouched. No reference worktree was modified. No identifiable project development server was running; unidentified relative-path Node processes were left untouched.

## Initial source audit (not runtime verification)

| Area | Existing evidence | Gap |
|---|---|---|
| Builder | `components/host/host-competition-wizard.tsx`, registry | Ten steps, obsolete digital submissions and online judge assignment; fixed foreign timezone; no draft restoration |
| Publication | challenge create/draft/publish, Admin reviews | Existing review/Enterprise authorization/media verification reusable; Live Event sync loses host settings and is outside approval transaction |
| Discovery/detail | live-events APIs/page | Requires account; listing reads `eventRegistrations` while registration writes `liveEventRegistrations`; duplicate challenge/synced records; public detail route absent |
| Admission | events registrations route | One account booking only; paid checkout fail-closed; capacity transaction exists but lacks transactional status/price rechecks; email synchronous |
| Check-in | live-events check-in route | Confirmed registrant can remotely check themselves in; no scoped staff, verification preview or strict window |
| Communications | existing Resend adapter and lifecycle outboxes | Existing provider acceptance is not inbox delivery; no complete Live Event retry/reminder/announcement consumer |
| Finance | Stripe webhook, monetization payments, wallet/withdrawals, refundCases | Existing systems reusable; no Live Event combined admission/entry payment reconciliation or earnings eligibility; no selected payout adapter |
| Results | shared challenge management/judging | No complete physical-score ingestion, checked-in eligibility, tie assessment and immutable announcement journey |
| Rules/jobs | Firestore default deny; existing Normal/Tournament authenticated workers | New server-only records remain default denied to clients; no Live Event durable job dispatch configured |
| Tests | Live Event contracts, P0/browser registration coverage | Historical contracts assert superseded ten-step/digital design; no complete guest, split-capacity, payment or physical-results journeys |

## Boundaries

No live Firebase, Stripe, Vercel, Rules, index, IAM, scheduler, email or payout activation. Existing real-money services must be reused; unavailable integrations remain unavailable. Test fixtures are not provider verification. Refund/cancellation behavior must use approved existing policy or stay in auditable review; no invented exclusions or replacement prize funding.

## Execution evidence

Implementation and test results will be appended as executed. This document does not certify completion.

## Approved refund policy (owner confirmation during this run)

- Purchase-time admission policy: Flexible (24 hours), Standard/default (48 hours), Strict (7 days), or Non-refundable. Never overwrite purchase-time terms.
- Voluntary competition withdrawal does not refund competition entry fees. Admission remains independently governed; competitor spaces never automatically become audience spaces.
- Organizer cancellation initiates full confirmed admission and competition refunds without deducting platform fees. Unrecoverable processing costs are platform operating expenses. Disputes, completed external payouts and uncertain provider states require audited reconciliation.
- Material venue/date/time changes permit full refund requests within seven days of notification or before revised event start, whichever comes first. Preserve stronger legal rights.
- Ordinary used-ticket/no-show voluntary refunds are unavailable. Exceptions require the applicable protection/review path.
- Individual unused-ticket refunds, idempotency, revocation, separate revenue reconciliation, withdrawal holds and provider-confirmed completion are mandatory.

## Current implementation checkpoint — NOT COMPLETE

| Phase | Current status |
|---|---|
| 1 preservation/audit | Verified baseline, stable source recovery and isolated branch |
| 2 product/UX | Partially implemented; new surfaces reuse the existing UI, still require browser review |
| 3 builder | Five/six-step builder connected, semantic draft restoration, physical formats and media controls; paid/funding publication intentionally unavailable pending full integration |
| 4 detail | Public allowlisted endpoint and tabbed page, booking cards and ticket retrieval connected; host/save/calendar and complete results presentation remain unfinished |
| 5 guests | Expiring single-use email code, one-event guest sessions, multiple free tickets and retrieval backend; QR presentation and full browser journeys unfinished |
| 6 competition | Atomic free entry and unique participant pass; paid entry/admission reuse unfinished |
| 7 money | Pure admission 85/15 and entry 65/20/15 allocation tests; actual checkout, earnings posting/clearance and provider reconciliation NOT implemented in this run |
| 8 confirmations | Confirmation UI and pending outbox records exist; branded ticket delivery/retry consumer unfinished |
| 9 management | Owner-authorized overview, guest lookup, manual admission and results UI connected; Messages, Tickets & Earnings and full event-edit workflow unfinished |
| 10 arrivals | Staff-authorized verification/explicit confirmation transaction; duplicate entrance protection. Staff invitation acceptance/revocation, QR scanning and recorded attendance corrections unfinished |
| 11 communications | Not implemented beyond confirmation outbox; reminders, announcements, notifications of reviewed material changes and durable consumers unfinished |
| 12 physical results | Checked-in eligible competitors, all judges' scores, version guards, correction audit, tie hold and immutable announcement service; settlement/financial entitlement integration unfinished |
| 13 refunds | Approved terms captured in schema and booking snapshot; pure eligibility tested. Provider refund/reversal, cancellation execution and reconciliation NOT implemented |
| 14 lifecycle | Existing review sync now transactional and includes event settings; booking/check-in windows guarded. Durable lifecycle jobs and full completion/cancellation integration unfinished |
| 15 tests | Focused local evidence below; full journey and release gates not yet passed |
| 16 final acceptance | NOT COMPLETE; no publication, no production-readiness assertion |

### Executed evidence

- Policy suite: `node --experimental-transform-types --experimental-loader ./scripts/ts-alias-loader.mjs scripts/test-live-event-policy.mjs` — **536 assertions passed**.
- Focused emulator service suite — **27 assertions passed**, `C:\Users\seyia\AppData\Local\Temp\challenge-suite-p0-isolated-tlNXa6`. Five actual-handler assertions were subsequently added and require rerun; the 27 result does not cover those additions.
- Typecheck and full lint passed at intermediate checkpoints. Recheck after the final edits before treating these as final evidence.
- Full P0 attempt: 15 suites passed, stopped at `test-enterprise-active-cap-concurrency.mjs`, total planned 69. Emulator log reports `Transaction is invalid or closed`; expected Enterprise capacity-policy rejection instead returned Firestore code 3. The Enterprise service/test source is unchanged. Environmental versus pre-existing concurrency cause is not conclusively established; do not suppress the assertion or claim the full suite passed.
- Earlier sandbox emulator startup failed before assertions because its local port did not become available. An escalated, isolated demo execution worked. Subsequent real failures found and corrected missing event-start validation and unsafe UID-prefix guest inference.
- New server-only collections retain existing Firestore default-deny client access. No Rules/index publication, cloud/provider activation, live payment, email or payout was performed.
- New V2 builder/publication/security contracts passed (`scripts/test-live-event-v2-contracts.mjs`), including semantic five/six-step navigation, draft preservation wiring and fail-closed paid publication. These do not prove actual browser draft save/publication.
- Isolated production build and selected existing Tournament builder journey completed successfully: **1 selected journey, 21 assertions, 12 intentionally skipped**. Evidence: `C:\Users\seyia\AppData\Local\Temp\challenge-suite-p1-browser-399ff2343e184bfbaf4c55d5efa1b6d6\results.json`; runner `challenge-suite-p0-isolated-jNJj8C/result.json` exited 0. This is preservation evidence for that Tournament journey, not verification of the new Live Event pages.

### Important remaining verification work

Existing source contracts asserting the former ten-step Live Event builder and digital/online judge controls must be updated to the approved physical five/six-step requirements with equivalent meaningful coverage. They have not been represented as passing. Complete actual-handler authorization/payment tests and new Live Event browser journeys; a passing unrelated Tournament journey does not verify Live Events.

## Current changed-file inventory

### Continuation checkpoint — 18 October 2026

#### Newly approved Live Event Sponsor policy

Physical Competition sponsor reservations use the existing Sponsor reservation duration and are capped at the authoritative event funding cutoff. New reservations and provider-confirmed contributions must both occur strictly before that cutoff. Use the authoritative scheduled start or an earlier verified actual start; a manual delay cannot extend it. A legitimate reschedule before cutoff may update it through approved event review, but an occurred cutoff never reopens automatically. Delayed webhooks require trustworthy evidence of pre-cutoff confirmation and a valid reservation. Late/ambiguous/restricted payments never inflate prizes; verified eligible returns use existing safeguards, and uncertain cases require audited Admin reconciliation. Sponsor prize funds remain separate and fully prize-designated, without admission fees. Preserve Normal, Private and Tournament policies. No commit, push or deployment is authorized.

#### Additional executed evidence

- Focused signed-out browser journey: **PASS**, 12 journey assertions plus one global assertion, 13 other journeys intentionally filtered. Isolated production build passed. Artifacts: `C:\Users\seyia\AppData\Local\Temp\challenge-suite-p1-browser-c3692b61347d43afa6452ae2e1574b42`; runner `challenge-suite-p0-isolated-joVfqj` exit 0. This used a deterministic email-delivery adapter and actual verification/booking/ticket endpoints; it is not real provider delivery verification.
- Expanded local admission/payment/refund suite: **84 assertions passed**, runner `C:\Users\seyia\AppData\Local\Temp\challenge-suite-p0-isolated-Q4JGvN`, exit 0. Includes actual guest Checkout and offline HMAC-signed Stripe webhook handlers, invalid signature rejection, concurrent fulfillment/refund initiation, pending-refund status, full customer amount, and conserved ledger reversal. It does not verify live Stripe.
- Paid checkout and automatic refunds remain opt-in and disabled by default. Newly added communications/lifecycle modules and subsequent edits still require focused tests and fresh final checks. Essential outstanding requirements remain tracked below; this is not a completion report.

- Preserved branch `codex/live-event-complete-20261017` and HEAD `ac83cdb1b7ae9e29e04f980682f03d5b8d636948`; no commit, push, deployment or cloud changes.
- Connected locally generated QR codes and individual fragment-based ticket links to My Tickets. Ticket presentation uses a restricted response and credential proof; entrance scanning supports camera and manual recovery.
- Added persisted staff-expiration enforcement and server-side competitor identity confirmation before first admission. Arrival correction followed by renewed admission preserves separate audit records rather than colliding with the original arrival record.
- Fresh focused demo-emulator run: **35 assertions passed**, evidence `C:\Users\seyia\AppData\Local\Temp\challenge-suite-p0-isolated-atuabY`. This covers the updated admission service and selected actual route boundaries, not the complete paid or browser journey.
- Fresh policy suite: **544 assertions passed**. V2 builder/publication/security contracts passed. Typecheck passed before the latest reservation helper; final recheck still required. Full lint and focused browser rerun are in progress, not yet passing evidence.
- Locked paid policy is now approved: atomic 30-minute audience/competitor reservations, capped by registration closing, with no new checkout at closing; competitor admission consumes only its reserved competitor space. Stripe's longer minimum lifetime never extends the internal deadline. Implemented and unit-tested the deadline/timing policy helper; provider checkout, webhook fulfillment, capacity release/reconciliation and user countdown are **not yet complete**.
- Timing evidence remains conservative: a verified captured-card paid-state snapshot can establish an upper bound; event creation is not an exact payment-completion timestamp. An ambiguous or late snapshot requires review and does not itself prove that payment was late.
- Outstanding scope remains paid registration, partial-ticket and cancellation refunds, communications and protected durable processing, financial/wallet integration, full management workflows, publication/browser journeys, legacy contract updates and full regression verification. No phase is declared complete on the strength of these focused checks.

All changes below are uncommitted. Original generated configuration, lint reports and package-manager artifacts remain locally preserved.

- `app/api/admin/reviews/route.ts`
- `app/api/challenges/[id]/publish/route.ts`
- `app/api/challenges/route.ts`
- `app/api/events/[id]/registrations/route.ts`
- `app/api/live-events/[id]/check-in/route.ts`
- `app/api/live-events/route.ts`
- `app/api/submissions/[id]/route.ts`
- `app/api/submissions/route.ts`
- `app/api/votes/route.ts`
- `app/live-events/page.tsx`
- `components/host/host-competition-wizard.tsx`
- `lib/challenge-builder-registry.ts`
- `lib/server/advanced-competitions.ts`
- `lib/server/challenge-validation.ts`
- `lib/server/voting.ts`
- `scripts/run-isolated-p0-emulators.mjs`
- `scripts/run-local-verification-suite.mjs`
- `scripts/run-p0-emulator-regressions.mjs`
- `app/api/live-events/[id]/bookings/route.ts`
- `app/api/live-events/[id]/guest-verification/route.ts`
- `app/api/live-events/[id]/management/route.ts`
- `app/api/live-events/[id]/public/route.ts`
- `app/api/live-events/[id]/tickets/route.ts`
- `app/live-events/[id]/manage/page.tsx`
- `app/live-events/[id]/page.tsx`
- `components/host/live-event-builder-v2.tsx`
- `docs/live-event-implementation-continuation.md`
- `lib/live-event-policy.ts`
- `lib/server/live-event-admission.ts`
- `lib/server/live-event-guests.ts`
- `lib/server/live-event-results.ts`
- `scripts/test-live-event-admission-emulator.mjs`
- `scripts/test-live-event-policy.mjs`
- `scripts/test-live-event-v2-contracts.mjs`

Preserved pre-existing exclusions:

- `next-env.d.ts`
- `tsconfig.json`
- `tsconfig.tsbuildinfo`
- `.pnpm-store/v11/index.db`
- `lint-batch5b-baseline.json`
- `lint-batch5b-current.json`
- `lint-batch5b-group2.json`
- `lint-batch5b-progress.json`
- `lint-batch5b-progress2.json`
- `lint-batch5b-targeted.json`
- `lint-escaping-targeted.json`
