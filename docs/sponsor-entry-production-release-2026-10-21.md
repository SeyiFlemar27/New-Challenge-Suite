# Sponsor entry repair: Production deployed and verified

Production was updated and independently verified at 16:32 on 21 October 2026 (Africa/Lagos).

## Deployment

- Exact Git SHA: `f7f6674fabb19802a19800d5a1a93c2a67248d36`, branch main.
- Vercel project: challenge-suite, `prj_RuZ2HwHUfOxCubMH1EfvB4Bkm6RX`.
- Deployment: `dpl_DbTCQmZPAj8s1SaoHrrfV6tWShB2`, Production, READY.
- Deployment URL: https://challenge-suite-l5kepgblh-seyiflemar27s-projects.vercel.app
- Independently verified serving domain: https://www.challengesuite.com

The user explicitly approved an exception to automatic Git deployment after the push produced no deployment. The reviewed request used only the existing linked Git repository, exact SHA, main ref, Production target, and existing project configuration. No local files or environment overrides were uploaded. The connector denied creation permission; the same approved request succeeded through the existing CLI account. No credentials, IAM or integration permissions were changed.

This supersedes the earlier pending-deployment status report; that report and its failed source-match evidence remain preserved as historical evidence. The underlying automatic push-trigger issue has not been diagnosed or repaired by this deployment exception.

## Checks

- Independent serving-source verification passed: exact SHA, main branch, correct project, READY, Production domain assignment.
- 25/25 safe Production probes passed, zero failed/skipped. Includes public pages, Explore/refresh, existing public detail, Sponsor introduction/onboarding protected pages, authenticated API boundaries, anonymous Sponsor setup rejection, challenge publication rejection, and Tournament worker/recovery rejection.
- Live Event financial-operation availability remained disabled.
- Bounded deployment error and HTTP 5xx log queries returned zero rows. This does not prove the absence of all future errors or unrelated concurrent operations.
- Tournament scheduler flags remain literal false; recovery Scheduler PAUSED; dedicated queue empty. No registration, scheduling, task, payment or payout activation was performed.
- The applicable preserved candidate evidence passed a fresh production build, 17 browser journeys/54 assertions, 69 routing assertions, TypeScript, lint and diff checks. See sponsor-entry-regression-2026-10-21.json. Unrelated filtered journeys and the preexisting retired-component source-contract failure remain clearly distinguished there and in the implementation report.

## Acceptance limits and preservation

No authenticated Production Sponsor setup, fresh credential Host login, successful challenge publication, upload, payment or provider worker dispatch was performed during this deployment. Those successes are not inferred from anonymous probes or emulator fixtures. No synthetic Production users or application/financial records were created. Normal user-driven Sponsor setup remains protected by authenticated, verified-account checks and does not grant approval, membership or funding privileges.

The original next-env.d.ts, tsconfig.json and tsconfig.tsbuildinfo changes remain unstaged; all unrelated artifacts, private configuration, recovery snapshot and historical worktrees are preserved. The deployed source is the exact committed candidate.

Rollback reference: previous verified READY deployment `dpl_FKiPfqf2U4KCS29GubqhDE71JtCJ`, SHA `ffed366635b35c32e1af99881c1d045ec1020f26`, https://challenge-suite-8bpruqvtk-seyiflemar27s-projects.vercel.app. No rollback was required. Application rollback does not reverse user/provider/database side effects.

## Local execution evidence

- sponsor-entry-production-deployment-created-2026-10-21.json
- dashboard-sponsor-live-deployed-2026-10-21.json
- dashboard-sponsor-live-production-smoke-2026-10-21.json
- dashboard-sponsor-live-runtime-logs-2026-10-21.json
- sponsor-entry-exact-sha-production-deployment-request-2026-10-21.json

These reports contain sanitized metadata and test outcomes, not authentication secrets. This post-release report remains local to avoid an unnecessary new application commit/deployment.
