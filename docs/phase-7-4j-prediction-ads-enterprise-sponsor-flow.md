# Phase 7.4J: Prediction, Ads, Enterprise, Sponsor Flow, Rewards, and Admin Polish

## Summary

Phase 7.4J updates Challenge Suite from a DoroCoin-only Prediction Arena foundation to a real-money Prediction Arena foundation that is not active until compliance, provider, and admin gates are satisfied. It also improves upload progress states, moves Trending Challenges higher in Creator Studio, places ads-for-votes near challenge voting, adds Enterprise Contact Sales, improves sponsor overview quality, expands admin operations, and turns the Voter Rewards Wheel into a visible server-selected spin experience.

No automatic settlement, payout, withdrawal, refund, sponsor release, prize release, fake KYC approval, DoroCoin-to-cash conversion, fake ad reward, or automatic high-value reward fulfillment was activated.

## Real-Money Prediction Arena Design

Public naming remains `Prediction Arena`.

The new foundation uses:

- `stakeAmountUsd`
- `platformFeePercent: 7`
- `platformFeeUsd`
- `netStakeUsd`
- `predictionStatus`
- `paymentStatus`
- `settlementStatus`
- `refundStatus`

The 7% platform fee is calculated immediately from the stake amount in the UI and API foundation. This is documented as pending client confirmation because final fee timing still needs client sign-off.

## Compliance And Eligibility Gates

The Prediction Arena API now checks foundation gates before recording a real-money prediction record:

- feature flag enabled: `REAL_MONEY_PREDICTION_ARENA_ENABLED=true`
- payment provider state: `disabled | stripe_pending_approval | stripe_approved`
- KYC status must be verified
- age verification must be true
- user region must be `US`
- challenge market must be admin-approved
- prediction window must be open
- terms and responsible-play notice must be accepted
- private challenge access must exist for private/exclusive challenges

If provider approval is missing, the UI shows: `Real-money Prediction Arena is not active yet. Payment provider approval is required.`

## Stake Limits

Defaults:

- minimum stake: `$1`
- default maximum stake: `$100`
- verified maximum stake: `$500`

These remain foundation defaults and should become admin-configurable before launch.

## Participant Selection Redesign

`/challenges/[id]/prediction` now uses participant cards rather than a plain dropdown. Cards show public-safe fields:

- avatar/photo if available
- display name
- username/handle
- participant status
- entry status if public-safe
- profile link
- select action

The UI supports search and load more. Private challenge participants remain gated by private challenge access.

## Cancellation And Refund Foundation

Prediction records include review-only refund/settlement fields. Canceled, suspended, or disputed market handling should mark predictions for refund review only. No automatic refunds are executed.

Planned states:

- active
- closed
- locked
- settlement_pending
- settled
- canceled
- disputed
- refund_pending
- refund_reviewed

## Upload Progress Polish

`MediaUploadField` now has clearer upload states:

- uploading
- real Firebase progress percentage
- 25/50/75/100 markers
- processing upload
- uploaded successfully
- failed
- retry
- replace
- remove

No fake success is shown. If Firebase Storage fails or rules are unavailable, the upload fails closed and does not create a broken record.

## Trending Challenges Placement

Creator Studio now shows Trending Challenges above Creator Operations. The row uses a compact story-style horizontal scroll and links each item to challenge detail. A `View All Trending` CTA points to `/challenges`.

## Ads-For-Votes Provider Flow

Ads-for-votes now belongs near challenge voting, not primarily in wallet. The challenge detail voting card explains:

- recommended provider: Google Ad Manager Rewarded Ads for Web
- provider callback verification is required
- bonus votes are not granted from client-only events
- after 3 consecutive verified ad watches, a 1-hour cooldown applies

The API records blocked attempts with:

- `adProvider`
- `adRewardStatus`
- `voteGranted: false`
- `providerVerificationRequired: true`
- `clientGrantBlocked: true`
- `adConsecutiveLimit: 3`
- `adCooldownMinutes: 60`

## Private Challenge Monthly Lock Flow

`/private` and `/private-exclusive` now show private challenge usage/limit copy and upgrade CTAs.

Rules remain:

- Free: private creation locked
- Creator: 1 private challenge/month
- Host: host plan allowance
- Enterprise: advanced private/exclusive tools

Server-side private limit enforcement remains in `/api/challenges`.

## Split Creation Flows

New section entry points:

- `/private` routes to the private/exclusive workspace
- `/live` routes to live events
- `/hybrid` routes to the host hybrid builder
- `/host/hybrid` opens the host competition wizard with Hybrid Competition selected

The generic builder remains available but section-specific CTAs now exist.

## My Challenges Flicker Fix

`/my-challenges` now shows a loading skeleton while auth/tier state resolves. Free users are not shown a premature `Become Creator` gate. They see Create Challenge, My Entries, and plan context.

## Enterprise Contact Sales Flow

Enterprise now uses `Contact Sales` rather than Stripe checkout.

Routes/API:

- `/contact-sales`
- `/enterprise/contact`
- `/api/enterprise-inquiries`

The inquiry form captures:

- full name
- company/organization
- work email
- phone optional
- website
- expected monthly challenge volume
- use case
- live event needs
- sponsor/brand needs
- team size
- budget range
- message

The API saves an `enterpriseInquiries` record and an admin notification. If email is not configured, the user sees that the inquiry was saved and the sales team will follow up.

## Admin Improvements

Admin navigation and operations now include foundations for:

- Risk & Safety dashboard
- upload/media moderation
- Prediction Arena market review
- prediction settlement/refund review
- ad reward verification logs
- enterprise leads
- feature flags for real-money Prediction Arena, ad votes, rewards wheel, uploads, private challenges, and revenue-share visibility

All sensitive writes remain server/admin-only.

## Sponsor Approval UX And Overview

Sponsor dashboard now includes:

- sponsor banner and logo display
- brand identity summary
- verification and subscription metrics
- campaign capacity
- onboarding checklist
- support/messages card
- revenue ledger and campaign foundations

Approved sponsor notice is displayed once and auto-hides after 5 seconds using client-side seen-state. Rejected/needs-changes/suspended states remain visible through the persistent access notice.

## Voter Rewards Spin Wheel Flow

The rewards system now includes a real visible wheel experience.

Routes:

- `/rewards`
- `/rewards/wheel`
- `/rewards/history`
- `/admin/rewards`
- `/admin/rewards/prize-wheel`

Tier rules:

- Basic: 100 points = 1 Basic spin
- Standard: 250 points = 1 Standard spin
- Premium: 500 points = 1 Premium spin

Spin credits are tracked separately by tier:

- `basic`
- `standard`
- `premium`

Points still come only from server-confirmed DoroCoin purchase webhook flow. No frontend-only success page or client request grants points or spin credits.

## Server-Side Prize Selection

The `/api/rewards` POST flow now:

1. Authenticates the user.
2. Validates tier.
3. Validates spin credit.
4. Loads enabled, non-expired, in-inventory prizes.
5. Selects the prize server-side by configured weight.
6. Deducts one tier-specific spin credit.
7. Records spin history.
8. Creates manual fulfillment record when required.
9. Returns the selected prize for UI animation.

The browser animates to the server-selected prize. The browser does not choose the result.

## Prize Pools

Default foundation prize pools exist if admin prizes are not configured.

Basic prizes:

- small DoroCoin bonus
- 1 free vote
- basic badge
- small discount
- try again

Standard prizes:

- larger DoroCoin bonus
- multiple free votes
- standard badge/profile highlight
- sponsor coupon
- challenge entry discount

Premium prizes:

- bigger DoroCoin bonus
- premium badge
- event ticket/manual prize
- merch/product prize
- gift card/manual prize

No cash-out prize is enabled by default. Manual/high-value prizes require admin fulfillment.

## Firestore/API/Storage Notes

Rules were updated to explicitly fail closed for:

- prediction settlement reviews
- prediction refund reviews
- reward fulfillments
- spin credits
- reward point events
- enterprise inquiries
- feature flags

Existing Storage rules remain unpublished pending upload QA.

## Remaining P0 Issues

- Real-money Prediction Arena cannot launch until legal/compliance review, payment-provider approval, KYC/age/region verification, market approval, and settlement operations are finalized.
- Firestore rules still require controlled manual publication after staging QA.
- Storage rules still require controlled upload QA before broad publication.
- A separate staging Firebase project remains required for proper credentialed QA.

## Remaining P1 Issues

- Admin prize manager create/edit forms are still foundation-level.
- Ad provider callback integration must be implemented and verified.
- Enterprise lead email delivery should be wired to an approved provider.
- Sponsor approval seen-state should eventually be persisted server-side.
- Private challenge usage counters should read live monthly counts on the private workspace.
- Real-money Prediction Arena stake limits should become admin-configurable.

## QA Checklist

- Verify `/challenges/[id]/prediction` shows participant cards and no public forbidden labels.
- Verify provider-disabled state blocks real-money prediction submission.
- Verify KYC, age, region, terms, market approval, and window gates.
- Verify `/rewards/wheel` animates and lands on the server-selected prize.
- Verify spin credits decrease only after successful server spin.
- Verify no user can grant points or spin credits from the client.
- Verify manual prizes create pending fulfillment records.
- Verify `/contact-sales` saves inquiry without printing secrets.
- Verify `/admin/enterprise-leads`, `/admin/ad-rewards`, `/admin/prediction-settlements`, `/admin/media-moderation`, and `/admin/risk-safety` load.
- Verify upload progress states on challenge, sponsor, profile, event, submission, and prize media fields.
- Verify `/my-challenges` does not flash an incorrect upgrade gate.
- Verify mobile layout for `/rewards/wheel`, `/challenges/[id]/prediction`, `/contact-sales`, `/private`, `/sponsor/dashboard`, and `/admin`.
