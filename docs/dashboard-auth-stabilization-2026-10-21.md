# Dashboard authentication and routing stabilization

## Scope and baseline

Authoritative checkout: `C:\Dev\New-Challenge-Suite`, repository `SeyiFlemar27/New-Challenge-Suite`, implementation on `main`.
Baseline source: `3203f4a42877d70b0b58aaa4ec4243897c5f66e4`.
Independently inspected Production baseline: `dpl_9NY3gfa9Zq2omWAYbbvogemU8h4r`, READY, main, same SHA, existing Challenge Suite project/team. This is the rollback target for this release.

Existing dirty `next-env.d.ts`, `tsconfig.json`, `tsconfig.tsbuildinfo`, private environment files, operational evidence, caches, and historical worktrees are excluded from the release. The prior verified recovery snapshot remains at `C:\Users\seyia\AppData\Local\Temp\challenge-suite-auto-publish-recovery-c4RtLq`; it is not replaced or used as the implementation source.

## Confirmed causes

1. `lib/auth-destination.ts` and `lib/account-routing.ts` sent personal subscribers through `/dashboard` without resolving Host plan/onboarding. `app/dashboard/page.tsx` then redirected Hosts in an effect, after account-specific children could commit. A separate API-driven redirect effect competed with that effect. The original Production Host visual sequence has not been reproduced using a real Host account; these are source-confirmed causal paths.
2. `components/auth-provider.tsx` and `lib/hooks/use-current-user.ts` performed separate profile reads. The hook retained a module-level per-UID profile cache; token callbacks did not consistently hide the previous profile while resolving another identity. Profile failures could leave stale classification or Free fallback experiences.
3. `lib/firebase/auth-service.ts` forced a token refresh inside bootstrap reads invoked by the token-change listener, creating extra token callbacks and bootstrap/session work.
4. Dashboard query keys omitted identity/workspace. There was no comprehensive identity/scope cache invalidation. Late API responses could populate state after a user changed.
5. `components/workspace-route-boundary.tsx` mounted children while an authorized workspace switch was pending. Personal workspace return always used `/dashboard`; onboarding completion navigated before shared account state was refreshed.
6. The bootstrap projection normalized restricted account statuses through a deletion-only normalizer and returned legacy Enterprise fields instead of the already normalized staff-access record. Admin presentation now uses the existing server-authorized Admin result.
7. Browser acceptance caught a further resolver defect during implementation: inherited Creator capability made a completed Host appear to require Creator onboarding, dropping a safe requested action. The final resolver applies that Creator prerequisite only to non-Hosts.

## Architecture and behavior

The existing AuthProvider is the sole resolved profile authority. It coordinates server-session synchronization and UID-checked bootstrap, suppresses obsolete responses using generations, exposes explicit failure/retry states, and clears QueryClient data on identity and scope changes. The existing current-user hook now projects that state rather than establishing a second cache/fetch lifecycle. Bootstrap in-flight reads are deduplicated without retaining a permanent profile cache.

The centralized destination policy is reused by login, registration, verification, onboarding, workspace return and a pre-mount route gate. During unresolved authentication, account-specific pages/navigation are replaced with a neutral branded state. Correctable transport failures have retry/sign-out actions; they do not downgrade the account. Workspace switching also blocks children until authoritative state is refreshed.

Before: Host sign-in → `/dashboard` → Creator-capable UI can paint → redirect effect → Host.
After: Host sign-in → neutral verification → `/dashboard/host` → Host interface. Refresh resolves the same identity first. An entitled Host may intentionally open `/dashboard?view=creator`.

Safe internal action URLs survive sign-in and required onboarding. External, protocol-relative, encoded backslash/control-character, auth-loop and API return destinations are rejected. Workspace/Admin return destinations are checked against resolved access; server APIs remain the final authority.

## Account routing matrix

| Resolved state | Default destination |
|---|---|
| Free personal user | `/dashboard` (existing Competitor Dashboard) |
| Creator, onboarding complete | `/dashboard` (Creator Studio) |
| Creator, onboarding incomplete | `/onboarding/creator` |
| Host, onboarding complete | `/dashboard/host` |
| Host, onboarding incomplete | `/onboarding/host` |
| Sponsor, required setup incomplete | `/sponsor/onboarding` |
| Sponsor, authorized workspace | `/sponsor/dashboard` |
| Active authorized Enterprise workspace | `/enterprise` |
| Existing authorized Admin | `/admin` |
| Email verification pending | `/auth/verify-email` with safe return intent |
| Account selection / intro incomplete | `/onboarding/account-type` or `/onboarding/welcome` |
| Subscription activation pending | `/onboarding/premium`, no Free downgrade |
| Suspended/restricted/banned/disabled | Inline restricted-account state, support/sign-out |
| Existing account deletion/unavailability states | `/account/deletion-status` |
| Profile/session transport error | Neutral retry/sign-out state; no fallback dashboard |

Active workspace, personal subscription and account role remain distinct. No subscription entitlement, payment processing, Admin grants, Rules, indexes or production data migrations are changed.

## Verification evidence

The final checks and release evidence are recorded below before publication. Isolated Firebase fixtures use demo projects and local emulator ports; no live subscriptions or transactions are used. Google OAuth/provider acceptance and real account journeys are distinct from emulator evidence.

- Routing behavior suite: 49 assertions passed, including account matrix, aliases, setup, safe action returns and malformed/open redirects.
- Actual React provider race fixture: passed stale identity, cache isolation, workspace refresh, transport retry, session error and logout checks. Only transport/router boundaries are mocked in this fixture.
- Focused navigation/session source contracts: updated to shared resolver/entitlement-aware navigation; passed after obsolete source expectations were corrected.
- Final TypeScript: passed. Full ESLint: passed with no reported warnings/errors.
- Frozen offline dependency install: passed. `esbuild` is a pinned development-only browser-fixture bundler; its install lifecycle remains disabled. Runtime dependency versions are unchanged.
- Production-build browser regression: 22/22 journeys, 178 assertions, no uncaught client errors. Covers all five publishing variants and dashboard stability.
- Final production-build dashboard acceptance after the return-query fix: 13/13 journeys, 33 assertions, no uncaught client errors. Includes delayed mobile Host login, logout/login, refresh, upgrade, pending activation, failures/retry, Sponsor/Enterprise/Admin, workspace switching and protected action query preservation.
- P0 coverage: 68 suites passed in the initial batch; the Tournament lifecycle suite returned an unexpected authenticated-vote 401 and stopped that command before the final three suites. The unchanged lifecycle suite then passed fresh isolation (four formats, 424 assertions). The remaining admission (348), media (33) and publishing-review (225) assertions passed separately. Publishing-review initially returned CLI exit 2 after its successful child test because Firebase CLI shutdown timed out; a repeated command exited cleanly. All 72 P0 suites have successful results across these executions. The original full batch was not a clean pass; the one-off 401 cause remains unconfirmed and is retained in evidence rather than attributed to an application fix.
- Actual session persistence, revocation, logout and Remember Me emulator suite: 26 assertions passed within the initial P0 batch.

Sanitized suite details: `docs/dashboard-auth-regression-results-2026-10-21.json`. No browser authentication storage, tokens or raw provider logs are included. Original dirty TypeScript files differ only in generated route-type imports/includes, not compiler behavior; they remain excluded.

Earlier browser runs are retained: the first had 9/11 passing journeys (empty fixture update and the real Host safe-return bug); the second had 10/12 (missing fixture build-time environment definition and an Explore URL expectation that omitted its normal `page=1` normalization). A later run had 12/13 because its new direct-link test asserted before client navigation completed. A proper URL wait fixed that test; its complete query assertion remains enforced. Final reruns above passed. These earlier failed commands are not represented as passes.

## Production safety and release procedure

Use the existing Git integration only: explicit intended file staging, commit on main, non-forced push, then independently verify project/team, exact SHA, READY state and www domain assignment. No manual Preview promotion. Do not include unrelated dirty/generated files.

Before and after release, inspect the existing Production flags, paused Scheduler and empty dedicated queue read-only. No flags, Scheduler state, tasks, registrations, IAM, provider settings or production records may be changed by this release. `scripts/qa/verify-dashboard-auth-release.mjs` records sanitized read-only deployment/disabled-state evidence.

Rollback target: READY deployment `dpl_9NY3gfa9Zq2omWAYbbvogemU8h4r` (`3203f4a42877d70b0b58aaa4ec4243897c5f66e4`). If a severe regression occurs, restore that verified Production deployment using the existing rollback workflow, verify domain assignment and smoke tests, and report it. Application rollback does not reverse any external side effects; this release does not intentionally create any. Vercel rollback may suspend automatic domain assignment, which must be checked before subsequent releases.

## Post-deployment acceptance and limitations

Deployment identity and safe anonymous/read-only smoke tests are required. Real Host logout/login and refresh remain UNVERIFIED until observed using the user's existing account after manual normal login. No credentials, session cookies or tokens may be extracted or placed in artifacts. Other real account roles and Google OAuth remain unverified without separately available authorized access. Emulator results do not establish live provider functionality.

No staging Firebase environment exists. The owner previously accepted production-only deployment with emulator evidence and bounded post-deployment checks; no Production synthetic accounts, financial transactions or challenge records are created for this task.

## Exact release file inventory

```text
app/api/auth/profile/bootstrap/route.ts
app/auth/login/page.tsx
app/auth/register/page.tsx
app/auth/verify-email/page.tsx
app/dashboard/host/page.tsx
app/dashboard/page.tsx
app/onboarding/account-type/page.tsx
app/onboarding/creator/page.tsx
app/onboarding/host/page.tsx
app/onboarding/premium/page.tsx
app/onboarding/welcome/page.tsx
app/sponsor/dashboard/page.tsx
components/account-resolution-state.tsx
components/account-route-gate.tsx
components/auth-provider.tsx
components/plan-feature-gate.tsx
components/sidebar.tsx
components/verification-guard.tsx
components/workspace-route-boundary.tsx
components/workspace-switcher.tsx
docs/dashboard-auth-preflight-2026-10-21.json
docs/dashboard-auth-production-baseline-2026-10-21.json
docs/dashboard-auth-regression-results-2026-10-21.json
docs/dashboard-auth-stabilization-2026-10-21.md
lib/account-routing.ts
lib/api/client.ts
lib/auth-destination.ts
lib/firebase/auth-service.ts
lib/hooks/use-current-user.ts
package.json
pnpm-lock.yaml
pnpm-workspace.yaml
scripts/qa/dashboard-auth-journeys.mjs
scripts/qa/dashboard-provider-race-fixture.mjs
scripts/qa/inspect-dashboard-auth-runtime.mjs
scripts/qa/run-p1-browser-e2e.mjs
scripts/qa/smoke-dashboard-auth-production.mjs
scripts/qa/verify-dashboard-auth-release.mjs
scripts/stability-auth-admin-contact-contracts.mjs
scripts/test-auth-session-cookie-refresh-without-login-loop.mjs
scripts/test-dashboard-auth-routing.mjs
scripts/test-no-mixed-admin-sidebar-host-content.mjs
scripts/test-post-login-direct-dashboard-routing.mjs
```
