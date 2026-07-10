# Phase 7.4D Credentialed Browser QA, Demo Cleanup, and Protected Route Gate Fixes

Date: 2026-07-10
Live site: https://www.challengesuite.com
Local starting commit: e036eb2 Add live QA and rules readiness report
Latest Phase 7.4B feature commit: 845240c Add premium KYC sponsor revenue prediction and rewards foundations

## Executive Summary

Phase 7.4D completed the preflight gate, reviewed production deployment metadata, fixed local launch blockers that did not require credentials, and documented the credentialed QA still blocked by missing test accounts. The production deployment is Ready in Vercel, but the exact Git SHA is still not exposed by public headers or the inspected deployment output.

Code fixes in this phase are intentionally narrow:

- Filter demo/sample/test/mock/placeholder/QA profile records out of public global leaderboards, including profiles whose display name is `Demo Member`.
- Make Free user navigation consistent with the current product rule by exposing `Create Challenge` and `My Challenges` to Free Competitors.
- Make the Free Basic Challenge create flow show both used and remaining lifetime challenge counts.
- Update the Free dashboard to put Basic Challenge creation and My Challenges in primary user flow.

No payout, withdrawal execution, refund, sponsor release, prize release, fake KYC approval, raw ID/face storage, DoroCoin-to-cash conversion, real-money betting, automatic Prediction Arena settlement, or automatic high-value reward fulfillment was added.

## Deployment SHA Confirmation

Vercel CLI inspection confirmed production is Ready:

- Project: `challenge-suite`
- Target: production
- Status: Ready
- Production alias: `https://www.challengesuite.com`
- Recent deployment URL observed: `challenge-suite-ri7moeilu-seyiflemar27s-projects.vercel.app`

The CLI output did not expose a Git SHA. Public HTML and response headers also did not expose a commit SHA.

Status: Exact production SHA requires Vercel dashboard confirmation.

## Demo Leaderboard Cleanup

Phase 7.4C found `/api/leaderboards` returning a public ranking entry named `Demo Member`.

Local fix implemented:

- Expanded public demo/QA filtering in `lib/server/public-challenge.ts`.
- Added explicit profile field filtering for display name, name, username, email, userName, and userDisplayName.
- Filters records whose fields contain or equal demo/sample/placeholder/mock/test/QA markers.
- Filters obvious example/test email domains such as `@example.com`, `@test.com`, and `.test`.
- Updated `lib/server/leaderboard.ts` to use the expanded public-profile exclusion before building global leaderboard rows.

Expected production result after deployment: `Demo Member` and similarly marked test/placeholder profiles no longer appear in public leaderboard rankings. If no real leaderboard entries remain, the API should return the existing clean empty-state message.

## Protected Page Gate QA

Live HTTP behavior:

- Protected page routes return 200 app-shell HTML.
- Sensitive APIs correctly return 401 logged out.

Protected APIs verified as 401 logged out:

- `/api/wallet`
- `/api/withdrawals`
- `/api/predictions`
- `/api/rewards`
- `/api/admin/operations`
- `/api/private-exclusive`
- `/api/kyc`
- `/api/sponsor/profile`

Source review:

- `components/verification-guard.tsx` treats `/revenue-share`, `/rewards`, `/kyc`, `/prediction-arena`, `/admin`, `/sponsor/dashboard`, and host tools as protected browser routes.
- Logged-out browser users should see the premium `Sign in required` gate after hydration.
- Admin shell also verifies `/api/admin/access` and renders `Access denied` for unauthorized users.

Status: API protection passes. Browser-visible gate still needs Playwright/manual verification in a signed-out browser because no browser automation dependency or authenticated QA session was available in the current environment.

## Free User 3 Lifetime Challenge QA

Code paths verified:

- `lib/server/free-challenge-limits.ts` sets `FREE_BASIC_CHALLENGE_LIFETIME_LIMIT = 3`.
- `/api/challenges/usage` returns used, limit, remaining, and `rule: lifetime`.
- `/api/challenges` enforces the 3 lifetime Free Basic Challenge limit server-side before publish.
- `/api/challenges` blocks free/basic private visibility, sponsor fields, live events, tournament types, non-bragging prizes, submission approval, and weighted voting.
- `/challenges/create` shows `Free Basic Challenges Used: x of 3` and now also `Basic Challenges Remaining: y`.

Navigation fixes:

- Free Competitor sidebar now includes `Create Challenge` and `My Challenges`.
- Free mobile nav now includes `Create` instead of hiding creation behind Saved.
- Free dashboard primary CTA now points to `Create Basic Challenge` and includes `My Challenges`.

Credentialed status: real Free account creation/publish testing still requires a Free test account and disposable challenge records.

## Creator and Host QA

Source/foundation review:

- Paid Creator still uses advanced creation flow and keeps participation tools.
- Host dashboard/routes remain present and use Host control surfaces.
- Live-event fields are physical-first with external livestream metadata.
- Tournament UX describes multi-stage competition foundations.
- Revenue-share foundations remain review-only.

Credentialed status: not completed without Creator/Host test accounts. Required accounts:

- Paid Creator with active/trialing subscription and KYC pending/required metadata.
- Paid Host with active/trialing subscription and Host onboarding completed.

## Sponsor QA

Source/foundation review:

- Sponsor profile API normalizes website URLs including bare domains.
- Sponsor onboarding includes logo/banner URL preview states and error/replacement flow.
- Sponsor dashboard includes payment/status command-center foundations.

Credentialed status: not completed without sponsor test account. Required states:

- not_submitted
- draft
- pending_review
- needs_changes
- approved/unpaid
- approved/active
- rejected
- suspended

## KYC QA

Source/foundation review:

- `/api/kyc` requires authentication.
- KYC pages are present: `/kyc`, `/kyc/start`, `/kyc/status`, `/kyc/success`, `/kyc/failed`.
- KYC metadata stores provider/status/session/timestamp fields only.
- `rawIdentityStored` remains false.
- Success page says provider callbacks update verified status later and no fake approval is performed.
- Provider-not-configured messaging exists.

Credentialed status: premium pending-KYC browser state still requires a premium test user.

## Prediction Arena QA

Source/foundation review:

- Public app/components use `Prediction Arena` language.
- App/components scan did not find public `betting` copy.
- Challenge prediction page says this is not cash wagering.
- `/api/predictions` requires authentication.
- Prediction stakes are DoroCoin-only.
- 7% DoroCoin platform fee is calculated server-side.
- Settlement status remains admin-review/foundation only.
- No real-money payout or DoroCoin-to-cash conversion was added.

Credentialed status: live stake/insufficient-balance testing requires an authenticated user, DoroCoin wallet state, and a challenge with prediction enabled.

## Rewards and Prize Wheel QA

Source/foundation review:

- `/api/rewards` requires authentication.
- DoroCoin vote purchases award voter points server-side.
- Reward tiers are defined for Bronze, Silver, Gold, Platinum, and Diamond.
- Spin credits are awarded from server-side vote purchase milestones.
- Wheel spin consumes spin credit and creates spin history.
- Manual/high-value rewards remain pending admin fulfillment.
- Cash-out is disabled.

Credentialed status: live spin testing requires a user with spin credits and configured reward prize records.

## Revenue Share QA

Live/source review:

- `/revenue-share` displays the generated revenue split:
  - 65% winners
  - 15% host
  - 10% sponsor
  - 10% platform
- Initial prize pool is separately described as 100% to winners after review.
- Challenger vote-revenue bonus is separately described as 10% pending review.
- No automatic payout, withdrawal execution, sponsor release, or prize release is active.

## Private Invite QA

Source/foundation review:

- `/api/private-exclusive` requires authentication.
- `/private/[code]`, `/challenges/[id]/invite`, and `/challenges/[id]/access` exist.
- Invite validation checks enabled state, expiry, max uses, and challenge visibility.
- Private challenge access is required in `/api/challenges/[id]` unless the user is owner/host.
- Public challenge and public leaderboard paths use public challenge filtering that excludes private/exclusive records.

Credentialed status: valid/expired/disabled/max-use testing requires seeded private challenge and test invite records.

## Mobile QA

Automated viewport testing was not completed because no local browser automation dependency was available in the project. Source review included responsive navigation updates:

- Free mobile nav now exposes Create.
- Existing protected gate layout uses centered responsive cards.
- Major touched pages use grid/flex responsive classes.

Manual or Playwright QA remains required at 360px, 390px, 430px, 768px, 1024px, and desktop.

## Firestore Rules Recommendation

Firestore rules remain suitable for controlled manual publication after credentialed QA passes. Sensitive collections remain fail-closed locally, including KYC metadata, revenue ledgers, private invite/access records, prediction records, reward prizes/history, voter reward events, and tournament plans.

Recommendation: do not publish Firestore rules until the local 7.4D fixes are committed, deployed, and smoke-tested.

## Storage Rules Recommendation

Storage rules should remain unpublished unless the intended production state is uploads disabled. Current Storage rules intentionally fail-close media upload paths. Upload QA is required before reopening or publishing upload-capable rules.

## Remaining P0 Blockers

- Exact production Git SHA still requires Vercel dashboard confirmation.
- Firestore rules still require controlled manual publication after credentialed QA passes.
- Storage upload policy remains fail-closed and not upload-ready.

## Remaining P1 Issues

- Local demo leaderboard cleanup must be committed, deployed, and verified against `/api/leaderboards`.
- Credentialed browser QA remains incomplete without test accounts for Free, Creator, Host, Sponsor, Admin, KYC pending, and reward/prediction states.
- Protected pages should be manually checked in a real logged-out browser to verify the hydrated sign-in/access gate is clear.
- Sponsor onboarding must be tested with valid/bare-domain URLs and logo/banner preview URLs after deployment.

## Recommended Next Phase

Phase 7.4E should commit/deploy the 7.4D fixes, verify `/api/leaderboards` no longer returns `Demo Member`, then run credentialed browser QA using a prepared matrix of test accounts and seeded records.
