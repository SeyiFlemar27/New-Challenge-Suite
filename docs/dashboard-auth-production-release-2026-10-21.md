# Dashboard authentication Production release

## Deployment outcome

Production **was updated** through the existing automatic Git integration following a normal push to `origin/main`.

| Evidence | Verified value |
|---|---|
| Commit | `0eb6f7819a703d88dc9edab30d581564367df5bc` |
| Branch | `main` |
| Deployment | `dpl_BdGAnb5B5PxY5J8RQRD9fxWSgXac` |
| Deployment URL | https://challenge-suite-1ixzfnhgu-seyiflemar27s-projects.vercel.app |
| State | READY |
| Project | `challenge-suite` / `prj_RuZ2HwHUfOxCubMH1EfvB4Bkm6RX` |
| Production domain | https://www.challengesuite.com |
| Domain assignment | Independently matched to the new deployment |
| Rollback | `dpl_9NY3gfa9Zq2omWAYbbvogemU8h4r`, READY, source `3203f4a42877d70b0b58aaa4ec4243897c5f66e4` |
| Rollback performed | No |

No manual Preview promotion, force push, Production configuration change, Rules/index deployment, migration, new infrastructure or financial operation was used.

## Root causes and implementation

The baseline routed personal subscribers through `/dashboard`, where competing effects redirected Hosts after account-specific rendering. Profile authority was split between AuthProvider and a second cached bootstrap in the current-user hook; forced token refresh could re-enter the auth listener, while unscoped dashboard queries retained data across identities. Workspace boundaries rendered children during switching, and onboarding navigated before profile refresh. Bootstrap also flattened restricted account statuses and projected legacy Enterprise fields.

The existing AuthProvider now resolves session and UID-checked profile before account-specific rendering, rejects obsolete responses, and invalidates cached data on identity/scope transitions. The current-user hook projects that single state. Centralized routing directs verified, onboarded Hosts straight to `/dashboard/host`, gates restricted/unresolved states, and preserves safe action destinations through login/verification/onboarding. The dashboard no longer performs competing after-render redirects. Sidebar, query keys, workspace switching and onboarding share resolved account state.

Full causal analysis, routing matrix, changed-file inventory and security boundaries: [dashboard-auth-stabilization-2026-10-21.md](dashboard-auth-stabilization-2026-10-21.md). The commit contains exactly the 43 files listed there. Original dirty `next-env.d.ts`, `tsconfig.json`, `tsconfig.tsbuildinfo` and unrelated untracked operational files remain outside the commit. The verified recovery snapshot and historical worktrees were preserved.

## Regression evidence

- TypeScript, full ESLint, frozen offline install and staged diff checks passed.
- Central routing behavior: 49 assertions passed.
- Combined production-build browser regression: 22/22 journeys, 178 assertions; includes all five publishing builders, media, discovery/refresh and dashboard cases.
- Final production-build dashboard acceptance after the protected-action query fix: 13/13 journeys, 33 assertions, no uncaught client errors. Delayed mobile Host login, logout/login, refresh, onboarding, restrictions, upgrade/pending recovery, retry, safe redirects, email verification and Sponsor/Enterprise/Admin/workspace switching passed.
- Actual provider race fixture passed stale identity rejection, cache isolation, scope switching, retry and session failure checks; Firebase transport/router are mocked only for this targeted fixture.
- All 72 P0 suites have successful results across the initial batch and targeted reruns. The initial command passed 68, then failed on a Tournament lifecycle authenticated-vote 401 and stopped. That unchanged suite passed fresh isolation with 424 assertions; the three remaining suites passed separately: admission 348, media 33, publishing review 225. The original failure cause is unconfirmed. Publishing review also had a successful child test followed by a Firebase CLI shutdown timeout; the repeated command exited cleanly. These failed commands remain recorded.
- Session persistence, revocation, logout and Remember Me policy: 26 actual emulator assertions passed.

Detailed sanitized evidence: [dashboard-auth-regression-results-2026-10-21.json](dashboard-auth-regression-results-2026-10-21.json).

## Post-deployment verification

The exact commit, project, READY state and live domain assignment were independently verified at `2026-10-21T08:22:23.813Z`. The safe live smoke run completed at `2026-10-21T08:22:49.368Z`: **21 passed, zero failed, zero skipped**.

- Homepage, login, protected-page shells, Explore, Sponsor application and Enterprise contact returned successfully.
- Public Explore API and refresh, Tournament listing, existing public challenge detail API/page and operational configuration returned successfully.
- Anonymous requests to profile bootstrap, dashboard, Admin moderation and Enterprise workspace returned 401.
- Anonymous session creation, challenge publishing, Tournament worker and recovery requests returned 401 before authorized mutation.
- Live Event financial-operation availability remains disabled.
- Deployment-scoped logs since `2026-10-21T08:17:00Z` returned zero error rows and zero 5xx rows in the bounded review.
- Previous deployment independently remains READY; no rollback was required.

No synthetic Production accounts, challenges, votes, wallets, payments or transactions were created. The anonymous probes invoked no financial operations. This does not prove the absence of unrelated concurrent user writes or provider activity across the platform.

Evidence: [deployment](dashboard-auth-deployed-2026-10-21.json), [smoke checks](dashboard-auth-production-smoke-2026-10-21.json), [runtime logs](dashboard-auth-runtime-logs-2026-10-21.json), [rollback](dashboard-auth-rollback-2026-10-21.json).

## Tournament and authorization safeguards

Both Production scheduler flags were independently confirmed as literal false. The dedicated recovery Scheduler remains PAUSED and its queue empty. No tasks, registration, competition activation or provider operations were enabled. Existing server-side authentication, Admin/Enterprise/Sponsor permissions, entitlements, media and financial enforcement remain authoritative; this release changes no Rules, IAM or payment logic.

## Live account acceptance: pending

The user prepared their existing Host login manually without sharing credentials. Browser inventory confirms the normal Production login page, but browser control currently cannot attach its inspection/interaction channel to the tab. **Sign In has not been clicked by the agent.** A reconnect/manual-observation request is pending. Real Production Host logout/login and refresh are therefore **UNVERIFIED**, despite passing isolated browser acceptance. No production claim of absence of a Creator flash is made yet.

Other real Production Free, Creator, Sponsor, Enterprise, Admin and Google OAuth account journeys remain unverified without authorized account access. The existing open tab initially showed Creator Plan; it was not assumed to be the Host fixture. No account entitlement was modified to obtain a test result.

The owner deferred a staging Firebase environment; demo emulators and bounded read-only Production checks were used. Payment-provider and Tournament activation acceptance remain separate gates. The one-off emulator lifecycle 401 is a retained test-flakiness risk with successful fresh rerun, not a proven Production defect or a reason to weaken authorization.
