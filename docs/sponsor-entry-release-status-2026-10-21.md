# Sponsor repair: pushed, automatic deployment not observed

At 2026-10-21 15:19:46 UTC, the Sponsor repair was committed and pushed to origin/main as `f7f6674fabb19802a19800d5a1a93c2a67248d36`. Remote main was independently confirmed. The automatic Git deployment had not appeared in the latest Vercel inventory; no candidate deployment ID or build failure exists in the observed evidence.

## Current Production

The domain www.challengesuite.com still resolves to READY deployment `dpl_FKiPfqf2U4KCS29GubqhDE71JtCJ`, SHA `ffed366635b35c32e1af99881c1d045ec1020f26`, URL https://challenge-suite-8bpruqvtk-seyiflemar27s-projects.vercel.app. That release includes the Admin routing correction, not this Sponsor repair.

The exact-candidate serving-source check failed (`sourceMatches: false`) while project, domain and READY checks passed. Tournament flags remain false, recovery Scheduler PAUSED and queue empty. No rollback or manual deployment/promotion was performed.

Read-only Vercel project inspection confirmed the expected GitHub repository, main Production branch, automatic deployment creation enabled and no ignore-build command. The CLI event query returned no explanatory event in the bounded period. The connector event query was denied; its mapped CLI fallback succeeded. A GitHub combined-status lookup returned no statuses. These observations do not establish the underlying Git webhook cause. GitHub CLI is unavailable locally; no credentials or integration permissions were changed.

## Verification

- Fresh production build and isolated demo Firebase browser run: 17/17 journeys, 54 assertions, zero uncaught client errors, exit 0.
- Shared routing behavior: 69 assertions passed.
- TypeScript, full ESLint and diff checks passed.
- Sponsor membership, dedicated-panel and retired-proposal checks passed.
- One legacy source-only helper fails before assertions because a retired proposal component is missing; failure preserved.
- 26 unrelated browser journeys were filtered out, not represented as rerun passes. Historical broader release evidence remains distinct.
- New authenticated Production Sponsor setup and post-deployment candidate smokes are unverified because this candidate is not serving. Browser inspection was signed out and subsequently disconnected; no real Sponsor application was created.

## Exact committed files

1. app/api/sponsor/start/route.ts
2. app/sponsor/dashboard/page.tsx
3. app/sponsor/onboarding/page.tsx
4. app/sponsor/start/page.tsx
5. components/authenticated-topbar.tsx
6. components/sponsor/start-sponsor-profile.tsx
7. lib/account-routing.ts
8. scripts/qa/dashboard-auth-journeys.mjs
9. scripts/test-dashboard-auth-routing.mjs
10. docs/dashboard-admin-routing-production-release-2026-10-21.md
11. docs/sponsor-entry-regression-2026-10-21.json
12. docs/sponsor-entry-stabilization-2026-10-21.md

Original next-env.d.ts, tsconfig.json and tsconfig.tsbuildinfo changes remain unstaged. Private files, unrelated artifacts, recovery snapshot and historical worktrees are preserved.

## Next safe action

Inspect the existing Vercel/GitHub integration's push-delivery status for this exact SHA and restore/retry that delivery through the approved Git workflow. Do not create empty commits, force-push, substitute a manual Preview promotion or deploy another SHA. When an automatic deployment exists, inspect its build, wait for READY, verify exact SHA/main/project/domain, then run the prepared read-only Sponsor smoke and log helpers. Complete authenticated Sponsor entry with the user's normal authorized session; do not create synthetic Production records or change entitlements. Preserve the current verified deployment as rollback. Tournament activation remains separately blocked and must stay disabled.
