# Admin destination regression correction

## Confirmed cause

Release `0eb6f7819a703d88dc9edab30d581564367df5bc` incorrectly equated an authorized legacy `isAdmin` capability with an Admin account identity. Bootstrap projected `accountType: admin` for every such capability; the destination resolver and current-user hook also independently promoted that flag to Admin identity. The resolver's Admin priority therefore replaced personal Creator/Host destinations.

A bounded, read-only Production inspection found five account records with a boolean Admin flag, including personal Creator/Host roles and one explicit Admin role. Neither Production Admin email configuration record was present. No account identifiers, emails, claims, secrets or per-account inspection rows are committed in this report. No Production data or configuration was changed by the inspection.

## Correction

- Existing server authorization now annotates an explicit Admin account identity, after existing access-status/expiry checks, using already supported custom claims, the server allowlist, explicit role assignments, or an explicit Admin role/account type.
- A standalone legacy capability flag keeps its existing API authorization behavior but does not relabel a personal account or choose its dashboard.
- Bootstrap projects Admin account type only for that explicit, authorized identity.
- Central default routing, requested Admin return links and the Admin UI route boundary use the resolved account identity. Stale `next=/admin` links cannot force personal accounts back into the Admin panel.
- The current-user projection follows the same distinction. Account-type/role changes also invalidate cached scope data.
- The existing explicit Admin account retains its Admin destination. Creator, Host, Sponsor and Enterprise destinations and entitlement/onboarding requirements remain unchanged.

Existing API permission grants, Firestore account records, role assignments, custom claims, Rules, IAM, subscriptions, payments and Tournament operational configuration are unchanged. Any cleanup/revocation of historical privileged flags requires a separately reviewed account-permission decision; this release does not silently revoke or grant privileges.

## Verification

- Central routing: 56 behavioral assertions passed, including legacy-flagged Free/Creator/Host/Sponsor/Enterprise accounts and stale Admin return destinations.
- Actual Firebase Auth/Firestore/bootstrap/authorization handlers: 54 assertions passed across nine configurations: legacy Host, legacy Creator, ordinary account, explicit Admin role, Admin custom claim, assigned Admin role, suspended Admin, untrusted role label and server allowlist. Existing API allow/deny behavior remains enforced.
- Final production-build browser acceptance: 15/15 journeys, 44 assertions, zero failed journeys. Covers ordinary and legacy-flagged personal accounts, Host login/refresh/logout, stale Admin links, explicit Admin role/custom claim, Sponsor, Enterprise and workspace switching.
- Final TypeScript, full ESLint and diff checks passed. The browser harness built and served the actual Next.js production output.

An earlier browser run reached the correct personal dashboards but failed two additional fixture assertions because a separate Playwright API client did not carry the Firebase client's Bearer identity. Those assertions now inspect the application's actual authenticated bootstrap responses; they have not been weakened or bypassed. A pre-final build also demonstrated that a leftover Admin return URL could still select the Admin panel. The final shared return-link and UI boundary corrections cover that residual path. Original failed evidence is preserved locally.

The previous complete authentication and publishing regression evidence remains applicable to unchanged features. The focused rerun covers the affected account-classification and rendering paths. No live-provider acceptance is inferred from emulator results.

## Release and recovery

Implementation stays on `main`; only intended source/tests/documentation are committed. Original generated dirty files, private configuration, historical worktrees and recovery artifacts remain preserved. Production deployment uses the existing non-forced Git push and automatic Vercel integration, with exact SHA, READY state, domain and safe smoke verification afterward. Tournament flags remain false, recovery Scheduler paused and registration fail-closed.

Prior verified deployment `dpl_BdGAnb5B5PxY5J8RQRD9fxWSgXac` remains a rollback reference for this scoped correction. The earlier publishing deployment `dpl_9NY3gfa9Zq2omWAYbbvogemU8h4r` is preserved as the older recovery reference. No rollback or Production migration is planned.
