# Sponsor entry stabilization

## Confirmed defects

The personal sidebar and account menu link to `/sponsor/start`. That introduction previously linked straight to `/sponsor/onboarding`, without any authenticated setup action. `assertSponsorIntent` in `app/api/sponsor/profile/route.ts` rejects profile GET/save with HTTP 403 when an existing personal account has neither Sponsor membership nor stored Sponsor intent. The onboarding page discarded that failed GET, leaving a form that could not progress successfully. This is a verified code-path defect matching the reported entry path; no claim is made that the user's exact Production failure was captured.

Other related inconsistencies: central panel routing and the dashboard independently rejected existing pending Sponsor organization/profile context; the account menu hid entry for personal users with a historical Admin capability flag; the Sponsor draft used a single localStorage key across accounts; profile-loading failures had no visible retry.

## Changes

- `app/api/sponsor/start/route.ts`: authenticated, email-verified, transactional setup intent. Writes only `sponsorOnboardingStatus: not_started` to the requesting user's own users/profiles records if setup is absent. Repeated requests preserve existing status, organization and completed onboarding. Request bodies cannot select another user or grant permissions.
- `components/sponsor/start-sponsor-profile.tsx` and `app/sponsor/start/page.tsx`: explicit setup button, disabled while pending, useful failure, shared profile refresh before onboarding navigation.
- `lib/account-routing.ts` and `app/sponsor/dashboard/page.tsx`: one UI panel-context predicate accepts existing organization/profile/setup context without replacing personal default destinations. Sponsor APIs remain authoritative for membership, approval and operations.
- `components/authenticated-topbar.tsx`: explicit Admin identity, rather than historical capability, controls menu suppression.
- `app/sponsor/onboarding/page.tsx`: profile failure/retry and account-scoped local drafts. Legacy unscoped local data remains untouched and is not automatically copied to another identity.
- `scripts/qa/dashboard-auth-journeys.mjs` and `scripts/test-dashboard-auth-routing.mjs`: actual browser/API/emulator setup, repeat, review-preservation, Host identity, pending organization, refresh, error recovery and draft-isolation regression coverage.

No Sponsor or Enterprise approval bypass, subscription/role replacement, financial activation, production migration, Rules/index/IAM modification or Tournament activation is introduced. Setup intent alone creates no Sponsor organization, membership, verified status or funding permission.

## Validation and limits

The first sandbox browser attempt failed at emulator startup before journeys ran. The escalated intermediate production-build run passed 17/17 journeys and 51 assertions. The fresh final production build and 17/17 browser journeys passed with 54 assertions, zero failed journeys and no uncaught client errors. Shared routing passed 69 assertions. TypeScript, full ESLint and diff checks passed. The emulator command completed with exit 0; sanitized evidence is in sponsor-entry-regression-2026-10-21.json.

A legacy source-contract helper fails because it imports the already retired `components/sponsor/proposal-actions-menu.tsx`. This failure is preserved, not relabeled a pass. Sponsor organization-membership, dedicated-panel and proposal-retirement contracts passed. Actual flow tests provide the functional evidence for this repair.

Production acceptance must not create a synthetic Sponsor profile or change a real account's Sponsor state without specific authorization. Anonymous page/authorization probes are safe; authenticated setup completion remains unverified until an authorized account is used. Emulator success does not certify provider funding or approval operations.

The verified prior Production deployment `dpl_FKiPfqf2U4KCS29GubqhDE71JtCJ` at `ffed366635b35c32e1af99881c1d045ec1020f26` is the rollback reference. Existing unrelated files, recovery snapshot and historical worktrees are preserved. Deployment uses the existing main Git workflow after required checks; Tournament flags remain false and recovery Scheduler PAUSED.
