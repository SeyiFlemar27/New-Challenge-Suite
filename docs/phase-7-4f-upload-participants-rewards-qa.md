# Phase 7.4F: Upload QA, Participants Directory, Rewards QA, and Storage Publication Readiness

## Executive summary

Phase 7.4F focused on validating the Phase 7.4E upload, participant directory, Prediction Arena, rewards, ads-for-votes, and revenue-sharing foundations.

Result: **partial QA pass with one small targeted Storage rules fix applied**.

The public live route smoke test passed for the main affected routes. The exact production commit SHA is not exposed in public headers or HTML, so confirming that production is running `84169fb` still requires the Vercel dashboard/API. The codebase contains the expected Phase 7.4E implementation, but credentialed browser QA is still required for real uploads, sponsor media saves, authenticated reward spins, and private challenge visibility.

No payouts, withdrawals, refunds, sponsor releases, prize releases, fake KYC approval, raw ID/face storage, DoroCoin-to-cash conversion, real-money betting, fake ad vote rewards, automatic Prediction Arena settlement, or automatic high-value reward fulfillment were activated.

## Deployment verification

Target commit: `84169fb Add media uploads participants prediction rewards and ad vote foundations`.

Local repository state before QA:

- Branch: `main`
- Latest commit: `84169fb`
- Branch status: up to date with `origin/main`
- Working tree before QA: clean

Live public route smoke test against `https://www.challengesuite.com`:

| Route | Result |
| --- | --- |
| `/challenges` | HTTP 200 |
| `/challenges/create` | HTTP 200 |
| `/rewards` | HTTP 200 |
| `/rewards/wheel` | HTTP 200 |
| `/prediction-arena` | HTTP 200 |
| `/revenue-share` | HTTP 200 |
| `/sponsor/dashboard` | HTTP 200 |
| `/private` | HTTP 200 |

Public response headers show Vercel is serving the site, but do not expose the Git SHA. Exact production SHA requires Vercel dashboard/API confirmation.

## Media upload QA

Code review confirms the reusable upload component is present:

- `components/media-upload-field.tsx`

The upload component includes:

- upload button
- preview for images/videos
- replace/remove behavior
- upload progress
- image/video content type validation
- file size validation
- clear failure message
- Firebase Storage resumable uploads

User-facing upload replacements confirmed in code:

| Area | Status |
| --- | --- |
| Challenge cover image | Upload UI present |
| Challenge promo media | Upload UI present |
| Challenge trailer/promo video | Upload UI present |
| Challenge submission media | File upload with preview/progress present |
| Sponsor logo | Upload UI present |
| Sponsor banner | Upload UI present |
| Profile avatar | Upload UI present |
| Profile cover image | Upload UI present |
| Host/event promo media | Upload UI present |

Admin-only or system-level URL fields still exist where the value is a normalized stored URL/path or an external link. This is acceptable for backend metadata and external livestream URLs.

Credentialed browser upload testing was not completed because no signed-in test accounts/storage publication state were provided in this run.

## Storage rules QA

Storage rules were reviewed for the Phase 7.4E upload paths.

Expected path families are covered:

- `challengeMedia/{challengeId}/{userId}/{fileName}`
- `challengeMedia/drafts/{userId}/{fileName}`
- `challengeMedia/drafts/{userId}/{folder}/{fileName}`
- `challengeMedia/host-drafts/{userId}/{folder}/{fileName}`
- `submissions/{challengeId}/{userId}/{fileName}`
- `sponsorMedia/profile/{userId}/{folder}/{fileName}`
- `sponsorMedia/{sponsorId}/{userId}/{fileName}`
- `profileMedia/{userId}/{fileName}`
- `profileMedia/{userId}/{folder}/{fileName}`
- `rewardPrizeMedia/{prizeId}/{userId}/{fileName}`
- `eventMedia/{eventId}/{userId}/{fileName}`
- `eventMedia/host-drafts/{userId}/{folder}/{fileName}`

Small targeted fix applied during QA:

- Added support for direct draft challenge paths used by free challenge cover uploads.
- Added support for foldered profile media paths used by avatar/cover uploads.

Current rules enforce:

- signed-in upload requirement
- owner-scoped user ID paths
- admin-only reward prize media writes
- image type and size limits
- video type and size limits
- KYC identity document uploads denied
- fallback deny rule

Remaining Storage rule risk:

- Challenge ownership is enforced by user ID path shape, not by a Firestore ownership lookup in Storage rules.
- Participant submission authorization is owner-scoped by path, but does not prove the user joined the challenge inside Storage rules.
- Public media delivery and approved-submission public-read behavior need a signed URL or server-mediated delivery decision before broad production launch.

Recommendation: Storage rules are improved and suitable for **controlled staging publication**, but should not be published broadly to production until credentialed upload QA confirms the desired behavior.

## Challenge submission upload QA

Code review confirms:

- submission form uses file upload rather than a media URL field
- selected media preview appears
- upload progress is shown
- upload path uses `submissions/{challengeId}/{uid}/{file}`
- upload failure prevents submission creation
- submission stores uploaded media URL/path after successful upload

Credentialed browser QA still needed:

- image submission
- video submission where supported
- rejected file type
- oversized file
- Storage failure path
- approved public submission display
- private/pending/rejected media non-exposure

## Sponsor logo/banner upload QA

Code review confirms:

- sponsor logo uses `MediaUploadField`
- sponsor banner uses `MediaUploadField`
- previews are retained through the upload component
- saved values continue flowing into `logoUrl` and `bannerUrl` profile fields
- sponsor website URL normalization remains in the sponsor API route

Credentialed browser QA still needed:

- `brand.com`
- `www.brand.com`
- `https://brand.com`
- `http://brand.com`
- logo upload/save/display
- banner upload/save/display
- broken upload failure state
- sponsor state and payment state gates

## Participant directory QA

Code review confirms challenge detail now includes a Participants section.

Implemented behavior:

- participant count copy
- public-safe participant fields only
- avatar display when available
- fallback avatar icon
- profile links
- search/filter by name or username
- load-more pagination
- empty state

Public-safe fields returned by the challenge details API:

- display name
- username
- avatar URL
- public participant status
- entry status
- profile path

Not returned:

- email
- phone
- wallet data
- KYC status
- admin notes
- internal moderation notes
- risk flags

Remaining risk:

- Private challenge participant visibility needs credentialed browser testing with valid/invalid access states.
- The API relies on the challenge privacy gate and public participant status filtering; seeded private challenge QA is still needed.

## Prediction Arena QA

Code review confirms:

- challenge detail page includes a Prediction Arena card near engagement/voting content
- CTA routes to `/challenges/[id]/prediction`
- public copy uses “Prediction Arena” language
- participant selection is shown
- 7% DoroCoin platform fee is displayed
- net prediction pool is calculated
- user must accept DoroCoin-only/no-cash/no-automatic-settlement rules

Server-side restrictions present:

- requires authenticated user
- validates challenge exists
- blocks private/exclusive challenges without dedicated access review
- blocks after start date
- validates selected participant belongs to challenge
- validates participant status is eligible
- checks DoroCoin balance
- writes prediction record and DoroCoin transaction in a transaction
- no automatic settlement

Credentialed QA still needed:

- insufficient balance state
- successful stake lock/deduction
- started challenge rejection
- private challenge rejection/access behavior
- user prediction history update
- admin prediction review behavior

## DoroCoin purchase points and rewards QA

Code review confirms voter reward points now come from server-confirmed DoroCoin purchase webhook handling, via `awardDoroCoinPurchaseRewards`.

Expected tiers are implemented:

| Tier | Points | Spin credit |
| --- | ---: | --- |
| Basic | 100 | 1 Basic spin |
| Standard | 250 | 1 Standard spin |
| Premium | 500 | 1 Premium spin |

Confirmed behavior:

- vote spending no longer grants voter points
- frontend-only success does not award points
- webhook purchase flow awards points and tier spin credits
- spin credits are stored separately by tier in `rewardSpinCreditsByTier`
- `/api/rewards` returns tiered spin credits
- `/rewards/wheel` lets users select wheel tier

Credentialed QA still needed:

- live DoroCoin purchase webhook event
- tier crossing edge cases
- repeated webhook idempotency
- no-spin-credit state
- spin history display

## Prize wheel QA

Code review confirms:

- Basic/Standard/Premium wheel tiers are visible in the user wheel UI
- manual/cash-out safety copy is present
- spin API decrements tier-specific credits
- spin history records include the selected wheel tier
- spin results remain manual fulfillment foundation

Remaining P1 foundation gap:

- Admin prize-wheel manager still needs full browser QA and likely product polish for prize creation/editing, inventory, disabled/expired prize filtering, and fulfillment workflows.
- High-value/manual prizes remain safe because automatic fulfillment is not active.

## Ads-for-votes QA

Code review confirms:

- `/api/ad-votes` requires authentication
- no provider configured means `AD_PROVIDER_NOT_CONFIGURED`
- blocked ad attempt can be logged as a foundation record
- vote is not granted from a client button
- UI copy says ads for votes are not available yet
- provider verification is required before any future reward grant

Remaining P1 gap:

- No real provider integration exists yet.
- Daily limit/cooldown/provider callback behavior remains foundation-level.

## Revenue sharing QA

Revenue share visibility confirmed in:

- `/revenue-share`
- challenge detail revenue card
- existing dashboard/admin foundation copy

Expected copy and split are present:

- 65% winners
- 15% host
- 10% sponsor
- 10% platform
- initial prize/sponsor prize money remains separate and winner-directed after review
- challenger vote-revenue bonus remains separate and admin-review only

No payout, sponsor release, prize release, withdrawal execution, or DoroCoin-to-cash conversion was added.

## Mobile QA

Mobile QA was limited to code/layout review in this run.

Expected responsive behavior from code:

- upload fields use full-width cards/buttons
- participants grid collapses across breakpoints
- reward wheel uses stacked cards
- Prediction Arena cards use existing responsive app/card layout
- admin pages still require dedicated browser viewport QA

Credentialed/browser viewport QA still needed at:

- 360px
- 390px
- 430px
- 768px
- 1024px
- desktop

Priority pages:

- `/challenges/create`
- `/challenges/[id]`
- `/sponsor/dashboard`
- `/rewards/wheel`
- `/prediction-arena`
- `/revenue-share`
- `/private`
- `/admin`

## Firestore rules recommendation

Firestore rules were reviewed for relevant new collections:

- `predictionRecords`
- `rewardSpinHistory`
- `voterRewardEvents`
- `adVoteRewardLogs`
- `revenueShareLedgers`

These remain fail-closed for direct client reads/writes.

Recommendation: Firestore rules are suitable for controlled manual publication after credentialed staging QA confirms app flows still work through server APIs.

## Storage rules recommendation

Storage rules are improved after the targeted Phase 7.4F path fix.

Recommendation:

1. Publish Firestore rules first in a controlled staging window.
2. Publish Storage rules only in staging or controlled production QA after preparing signed-in test accounts.
3. Test upload success/failure for challenge, submission, sponsor, profile, host/event, and admin prize media.
4. Confirm private media is not publicly readable.
5. Confirm approved public media delivery strategy before broad public launch.

Default answer: **Storage rules should still remain unpublished for broad production until upload QA passes with real accounts.**

## Remaining P0 blockers

- Exact production SHA `84169fb` cannot be independently confirmed from public headers/HTML; Vercel dashboard/API confirmation is still required.
- Credentialed upload QA has not been completed with real/staging users and published Storage rules.
- Storage rules should not be broadly published until upload QA confirms path authorization and public/private media delivery behavior.

## Remaining P1 issues

- Sponsor logo/banner upload needs credentialed browser QA.
- Challenge submission image/video upload needs credentialed browser QA.
- Participant directory private-challenge visibility needs seeded private challenge QA.
- Prediction Arena needs authenticated DoroCoin balance and edge-state QA.
- Rewards wheel needs webhook-backed purchase/tier crossing QA.
- Admin prize-wheel manager remains foundation-level and needs richer operational QA.
- Ads-for-votes remains provider-foundation only.
- Mobile viewport QA still needs browser verification.

## Recommended next phase

Phase 7.4G should be a controlled staging QA pass with:

- Vercel deployment SHA confirmed from dashboard/API
- Firebase rules published to staging or controlled test project
- test users for Free, Creator, Host, Sponsor, Admin
- test challenge with participants
- private challenge invite fixtures
- test DoroCoin purchase webhook event
- Storage upload matrix screenshots/results
- admin reward fulfillment QA
- mobile viewport QA evidence

## Validation

Because Phase 7.4F applied a targeted Storage rules fix, validation was run:

- `pnpm.cmd typecheck`: passed
- `pnpm.cmd build`: passed, 96 routes generated
- generated metadata should be reverted before commit if this phase is later committed