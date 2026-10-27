# Explore, Details and Individual Tournament implementation ledger — 2026-10-22

Latest continuation: `docs/explore-details-tournament-resume-2026-10-26.md`. It records the verified recovery snapshot, completed 24/24 dashboard baseline, new versioned policy/media guards, focused emulator and allocation results, successful latest-source Webpack build, preserved cleanup failures and the precise unfinished Phase 1/2 continuation point. Older remaining-verification notes below are historical; use the dated continuation for current progress.

## Phase 0 baseline

Authoritative checkout: C:\Dev\New-Challenge-Suite. Branch main. HEAD and fetched origin/main: f6bcadb3f197d1a7f0f9341e340419775a781a9b. Origin: https://github.com/SeyiFlemar27/New-Challenge-Suite.git. Existing generated/type configuration changes and untracked operational evidence are preserved. No reset, stash, clean, branch switch or deployment is part of this program.

The user explicitly invoked the reviewed master brief in Downloads. Its release stop applies: local implementation/tests only; commit, push, Production deployment and infrastructure activation need fresh authorization. The prior six-dashboard release is the baseline, not work to redo.

## Explicit follow-up fixes

- Hide shared top search only on Free/Creator, Host, Enterprise and Sponsor dashboard home routes; retain Admin search and search on other pages.
- Separate intentional Admin entry from default personal dashboard selection. A server-confirmed Admin capability permits an explicit /admin return destination; it does not change a Host/Creator/Free default destination. AdminShell and API authorization remain independent and unchanged.
- Initial fresh checks: TypeScript and full lint passed. Routing contracts: 70 assertions passed. Presentation contracts: 31 assertions passed. Initial browser run: 22/24 journeys, 169 assertions; two expectations still treated an explicit /admin return link as default login. Those tests were corrected to use ordinary login; repeat pending. No live Admin login claim.

## Source-backed master audit

| Area | Existing source | Confirmed gap / required work |
|---|---|---|
| Policy and compatibility | lib/tournament-builder-policy.ts, lib/server/tournament-validation.ts, lib/server/tournaments.ts, app/api/tournaments/route.ts | Existing v3 policy allows Teams, 64/128 entrants and 60/25/15 allocation. Introduce a separate new Individual policy; do not recalculate historical funded prizes or remove legacy Team records. |
| Public submission visibility | lib/server/tournament-public.ts; app/api/tournaments/[id]/submissions/[submissionId]/media/route.ts | Both allow eligible-status submissions without checking scheduled voting phase. Apply one shared fail-closed phase policy to bundle and byte delivery. Preserve own/authorized management access. |
| Paid entry | lib/server/tournament-paid-entry.ts | Existing 10-minute reservations and reconciliation must be reused and tested, not replaced with UI success. |
| Lifecycle | tournament-activation.ts, tournament-lifecycle-scheduler.ts, tournament-result-confirmation.ts, tournament-match-lifecycle-jobs.ts | Existing random activation, per-match deadlines, extension, result advancement and reset need decision-by-decision verification. Existing support is not proof of D1–D31 compliance. |
| Finance | tournament-settlement.ts, tournament-settlement-policy.ts, tournament-funding-sources.ts | Existing evidence gates retained. New automatic internal-wallet settlement requires versioned allocation, conservation, holds and idempotency verification. No live provider tests authorized. |
| Explore | app/explore/page.tsx; app/api/explore/challenges/route.ts | Current cards have description, multiple overlays, save action, fee row, and dark surfaces. Replace with approved minimal light cards and real dates. Private public-preview stream already exists: preserve it. Completed Tournament persistence needs verification. |
| Detail experiences | app/challenges/[id], app/tournaments/[id], app/live-events/[id], associated components | Inventory and visual parity pending. Preserve Normal gallery proportions, approved Live gallery decisions, private access and financial guards. |
| Participant utilities | app/my-challenges/page.tsx; tournament-notifications.ts | Tournament tab, Smart Priority, bounded reminders and truthful delivery status require verification. |

## Locked-decision traceability (work in progress; none marked passed from inspection alone)

| Decisions | Dependency / intended evidence |
|---|---|
| D1–D5 | Versioned Individual admission, capacities, 10-minute hold, withdrawal/countdown races, random activation; demo emulator concurrency tests. |
| D6–D12 | Verified upload/replace, server phase reveal, full extension, forfeit, result transitions and historical competitor vote rejection; service/media/browser tests. |
| D13–D17 | Versioned 50/30/20, bronze/Losers Final placement evidence, exactly-once internal credit, Winners page, completed discovery and My Challenges tab; conservation and browser tests. |
| D18–D21 | Deduplicated reminders, urgency ordering, dependency-neutral waiting, common full-duration match start; deterministic time tests. |
| D22–D25 | Full-window extension, double-forfeit state, valid byes and affected-position holds, automatic Grand Final/reset; 4/8/16/32 × single/double property tests. |
| D26–D31 | Scoped disputes, nonnegative audited corrections/manual recovery, cancellation/refund gates, publication immutability, UTC free vote/5-DC debit, reasoned Admin DQ; isolated financial/authorization tests. |

## External boundaries

Tournament scheduling/registration stays disabled and Scheduler paused. No test tasks, live payments/refunds, Production fixture writes, Rules/index/environment changes or infrastructure setup. Approved provider sandbox account and monitoring destination remain unverified. Emulator/mock results do not certify these dependencies or email delivery. The historical individual-tournament read-only audit named by the brief has not yet been located; its findings are not assumed.

## Remaining verification

Fresh six-dashboard baseline completion; verified recovery snapshot once source is stable; full policy/service implementation; complete D1–D31 matrix; Explore/Normal/Private/Tournament/Live browser coverage; responsive screenshots; final typecheck/lint/build/security/diff checks. This is an execution checkpoint, not a completion or readiness report.
