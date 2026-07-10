# Phase 7.4C Live QA, Rules Readiness, and Production Flow Testing

Date: 2026-07-10
Target live site: https://www.challengesuite.com
Target commit: 845240c Add premium KYC sponsor revenue prediction and rewards foundations

## Executive Summary

Live production is serving the Challenge Suite application and several Phase 7.4B surfaces are reachable. The strongest live indicator that 7.4B is deployed is `/revenue-share`, which returns the new generated-revenue split copy for 65% winners, 15% host, 10% sponsor, and 10% platform. The public HTTP responses and Vercel headers do not expose the Git SHA, so exact deployment-to-commit verification still needs Vercel dashboard/API confirmation.

Result: QA can proceed as a content and route smoke test, but launch should not proceed until the Vercel deployment record is manually confirmed as commit `845240c`.

## Deployment Verification

| Check | Result | Notes |
| --- | --- | --- |
| Local branch clean | Pass | `main` is clean and up to date with `origin/main`. |
| Local latest commit | Pass | `845240c` is the latest local commit. |
| Live homepage | Pass | `/` redirects to `/landing` and loads. |
| New 7.4B route presence | Partial pass | `/revenue-share`, `/prediction-arena`, `/rewards/wheel`, `/kyc/status`, and `/admin/predictions` return 200. |
| Exact live commit SHA | Needs manual confirmation | Public HTML/headers did not expose `845240c`. |
| Runtime crash | Pass on sampled public pages | No raw framework crash observed in HTTP smoke tests. |

## Public Route QA

Routes tested logged out:

- `/`
- `/landing`
- `/subscriptions`
- `/challenges`
- `/leaderboards`
- `/privacy`
- `/terms`
- `/community-guidelines`
- `/refund-policy`
- `/cookie-policy`
- `/contact`
- `/about`
- `/auth/login`
- `/auth/sign-in`
- `/auth/register`
- `/auth/verify-email`

Findings:

- All sampled public routes returned 200.
- `/auth/sign-in` resolves to `/auth/login` as expected.
- Legal pages are reachable.
- Landing page footer links are present.
- `/subscriptions`, `/challenges`, and `/leaderboards` return 200 but include app-shell text that appears related to authenticated workspace loading. This needs browser QA to confirm no public UX confusion.
- Public challenge/feed API responses did not include private/draft/review/suspended/internal markers in the smoke check.
- Public leaderboard API still returns a visible `Demo Member` entry. This should be removed or clearly excluded before public launch.

## Protected Route QA

Routes tested logged out:

- `/dashboard`
- `/favorites`
- `/wallet`
- `/wallet/withdraw`
- `/my-entries`
- `/my-challenges`
- `/settings`
- `/revenue-share`
- `/rewards`
- `/rewards/wheel`
- `/kyc`
- `/prediction-arena`
- `/admin`
- `/sponsor/dashboard`
- `/host/participants`
- `/host/submissions`
- `/host/voting`
- `/host/tournaments`
- `/host/reports`
- `/host/winners`
- `/host/team`

Findings:

- These page routes return 200 app-shell HTML when logged out rather than server-level 302/401 responses.
- API routes for sensitive data correctly rejected unauthenticated access in smoke tests: `/api/wallet`, `/api/withdrawals`, `/api/predictions`, `/api/rewards`, `/api/admin/operations`, `/api/private-exclusive`, `/api/kyc`, and `/api/sponsor/profile` returned 401.
- Because page protection appears client/app-shell based for multiple routes, browser QA is still required to verify the user sees a clean sign-in/access-denied state and no private data is hydrated into HTML.

## Free 3 Lifetime Challenge QA

Code path reviewed from Phase 7.4B:

- `/api/challenges/usage` exposes lifetime free-basic usage.
- `lib/server/free-challenge-limits.ts` defines a lifetime limit of 3.
- `/api/challenges` checks the free-basic lifetime count server-side before publish.
- Free/basic challenges are server-blocked from private visibility, sponsor fields, live events, tournament type, non-bragging prizes, submission approval, and weighted voting.
- `/challenges/create` displays `Free Basic Challenges Used: x of 3` in the free-basic flow.

Live account-state QA was not completed because no Free user credentials were provided in this phase.

## Private Invite QA

Code path reviewed from Phase 7.4B:

- `/private/[code]`, `/challenges/[id]/invite`, and `/challenges/[id]/access` exist.
- `/api/private-exclusive` requires authentication for private/exclusive listings.
- Invite code validation checks enabled state, expiry, max uses, and challenge visibility.
- Invite use writes access/audit foundation records.
- `/api/challenges/[id]` requires owner/host or approved private access for private/exclusive challenge details.

Live data-path smoke check:

- `/api/private-exclusive` returns 401 logged out.
- Private challenge bypass testing requires a real private challenge and user credentials.

## Sponsor QA

Code path reviewed from Phase 7.4B:

- Sponsor profile API normalizes website URLs including bare domains such as `brand.com`.
- Sponsor onboarding includes logo and banner URL preview states with replacement/error handling.
- Sponsor dashboard includes revenue-share foundation messaging.

Live sponsor workflow was not completed because sponsor test credentials were not provided.

## KYC QA

Routes checked:

- `/kyc`
- `/kyc/start`
- `/kyc/status`
- `/kyc/success`
- `/kyc/failed`

Findings:

- Routes return 200 at the page-shell level.
- `/api/kyc` returns 401 logged out.
- KYC implementation stores safe metadata fields only and does not store raw government ID images or face scans.
- If provider configuration is missing, the API is designed to return a provider-not-configured state instead of fake approval.
- Admin fake approval was not added in Phase 7.4B.

Live premium-user KYC progression requires premium test credentials and provider configuration status.

## Revenue Share QA

Route checked: `/revenue-share`

Findings:

- Live route contains the expected 65/15/10/10 generated revenue split copy.
- Initial prize pool is documented separately as 100% to winners after review.
- Challenger vote-revenue bonus is documented separately as 10% of vote revenue received.
- No automatic payout, sponsor release, prize release, or withdrawal execution was found in the reviewed Phase 7.4B paths.

## Prediction Arena QA

Routes checked:

- `/prediction-arena`
- `/challenges/[id]/prediction` foundation exists in code.
- `/admin/predictions` route exists.

Findings:

- Public code uses “Prediction Arena” language.
- App/components scan found no public `betting` wording.
- Prediction API requires authentication.
- Prediction stake is DoroCoin-only, calculates a 7% DoroCoin platform fee, and does not create cash payout behavior.
- Settlement remains foundation/admin-review only.

Live transaction testing requires an authenticated user with DoroCoin balance and a challenge with prediction enabled.

## Voter Rewards and Prize Wheel QA

Routes checked:

- `/rewards`
- `/rewards/wheel`
- `/rewards/history`
- `/admin/rewards`
- `/admin/rewards/prize-wheel`

Findings:

- Routes exist and return page shells.
- Rewards API requires authentication.
- DoroCoin vote purchases award voter points server-side.
- Spin credits are based on configured point tiers and are not directly self-grantable from the client.
- Wheel spin records are created with manual/admin fulfillment status.
- Cash-out is disabled.

Live spin testing requires an authenticated account with spin credits.

## Live Event QA

Code path reviewed:

- Live events are physical-first.
- External livestream fields exist: `externalLiveUrl`, `externalLiveProvider`, `externalLiveStatus`, `externalLiveOpensAt`, and `externalLiveCtaLabel`.
- UI copy uses partner-site/external livestream language and states that Challenge Suite does not host native livestream video.

Live event data QA requires a configured event record with external livestream metadata.

## Tournament QA

Code path reviewed:

- Tournament UX now describes multi-stage competition types.
- Supported types include knockout, bracket, league/table, audition to final, group stage to final, and custom rounds.
- Tournament pages explain stages, advancement, final review, and admin review foundations.
- No automatic prize release is active.

Live tournament data QA requires a host/test tournament record.

## Admin QA

Routes sampled:

- `/admin`
- `/admin/predictions`
- `/admin/rewards`
- `/admin/rewards/prize-wheel`
- `/admin/qa-data`

Findings:

- Admin page routes return app-shell HTML when logged out.
- `/api/admin/operations` returns 401 logged out, which is the critical data boundary.
- Admin pages still need browser QA with admin and non-admin credentials to verify the visible access-denied state, confirmation/reason dialogs, audit logs, and no accidental action execution.

## API Boundary QA

Unauthenticated API smoke results:

| API route | Result |
| --- | --- |
| `/api/challenges` | 200 public response, no private/internal markers found. |
| `/api/leaderboards` | 200 public response, but contains `Demo Member`. |
| `/api/feed` | 200 public response, no private/internal markers found. |
| `/api/wallet` | 401. |
| `/api/withdrawals` | 401. |
| `/api/predictions` | 401. |
| `/api/rewards` | 401. |
| `/api/admin/operations` | 401. |
| `/api/private-exclusive` | 401. |
| `/api/kyc` | 401. |
| `/api/sponsor/profile` | 401. |

## Mobile QA

HTTP-level checks cannot prove mobile layout. Browser viewport QA is still required for:

- `/landing`
- `/subscriptions`
- `/challenges`
- `/auth/register`
- `/dashboard`
- `/challenges/create`
- `/private`
- `/kyc`
- `/sponsor/dashboard`
- `/revenue-share`
- `/prediction-arena`
- `/rewards/wheel`
- `/admin`

Recommended viewport set: 360px, 390px, 430px, 768px, 1024px, desktop.

## Firestore Rules Readiness

Local `firestore.rules` now fail-close sensitive Phase 7.4B collections, including:

- `kycMetadata`
- `revenueShareLedgers`
- `privateChallengeInvites`
- `privateChallengeAccess`
- `privateInviteAuditEvents`
- `predictionRecords`
- `rewardWheelPrizes`
- `rewardSpinHistory`
- `voterRewardEvents`
- `tournamentPlans`

Recommendation:

1. Confirm Vercel is serving commit `845240c` from the Vercel dashboard.
2. Complete a staging QA pass with real test accounts.
3. Publish Firestore rules manually after QA passes.
4. Re-run unauthenticated API and client read tests after publication.

## Storage Rules Recommendation

Local `storage.rules` remain fail-closed. Upload paths are intentionally disabled for now.

Recommendation:

- Do not publish Storage rules as a production enablement step unless the desired outcome is to keep uploads disabled.
- Hold Storage publication until upload QA confirms that fail-closed behavior is acceptable or until explicit private/public media rules are designed.

## Remaining P0 Blockers

- Exact live deployment SHA `845240c` was not verifiable from public responses; confirm in Vercel before final launch QA sign-off.
- Firestore rules still require controlled manual publication after staging QA.
- Storage upload policy remains fail-closed and should not be treated as an upload-ready configuration.

## Remaining P1 Issues

- Public leaderboard API includes a `Demo Member` entry. Remove demo/test entries from production-facing leaderboards.
- Protected page routes return 200 app shells logged out. Confirm browser-visible gates and consider server-side redirects for higher-risk pages.
- Full role QA remains incomplete without test accounts for Free, Creator, Host, Sponsor, Admin, and premium pending-KYC states.
- Sponsor onboarding, logo/banner preview, KYC provider flow, private invite consumption, Prediction Arena stake, rewards spin, and admin action workflows still require authenticated browser QA.

## Recommended Next Phase

Phase 7.4D should be a credentialed browser QA pass with seeded/staging test accounts and targeted cleanup of the public leaderboard demo entry, protected-route server gates, and any sponsor/KYC/private-invite issues found during real interaction testing.
