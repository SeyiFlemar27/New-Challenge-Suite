# Phase 7.4B: Premium Flow, Sponsor Panel, Private Challenges, KYC, Revenue Sharing, Prediction Arena, and Voter Rewards

## Free Basic Challenge Rule

Non-premium users can publish up to **3 lifetime Free Basic Challenges**. This is not a monthly allowance.

Free Basic Challenges are limited to:

- public visibility only
- non-monetized challenge metadata
- no private invite-only mode
- no paid entry
- no prize pool
- no sponsorship
- no tournament or live-event mode
- no revenue sharing tools
- no advanced voting, boosts, host tools, Prediction Arena, or premium analytics

Server enforcement lives in the challenge creation API and counts published/reviewed Free Basic Challenge records by creator.

## Private Challenge Invite Code Model

Private challenge creation creates a `privateChallengeInvites` foundation record with:

- unique invite code
- max/current uses
- expiry placeholder
- enabled/disabled state
- optional approval/allowed-list placeholders
- audit events for invite use

Private challenge listing only returns records owned by the user or explicitly unlocked through `privateChallengeAccess`.

## Live Event External Livestream Model

Live events are physical-first. Challenge Suite tracks venue, registration, schedule, lineup, voting/results connection, and external livestream metadata:

- `externalLiveUrl`
- `externalLiveProvider`
- `externalLiveStatus`
- `externalLiveOpensAt`
- `externalLiveCtaLabel`

Native livestream hosting is not active.

## Tournament Model

Tournament now means a multi-stage competition. Supported foundations include knockout, bracket, league/table, audition-to-final, group-stage-to-final, and custom rounds.

Tournament records include stages, current stage, advancement rules, and a clear final winner/admin review process. Bracket execution and prize release remain inactive.

## Premium KYC Flow

Premium accounts can show `Premium Pending KYC` or `Premium Active - KYC Required` state. The KYC foundation stores only safe metadata:

- `kycRequired`
- `kycStatus`
- `kycProvider`
- `kycSessionId`
- timestamps and failure reason

Raw government IDs, driver licenses, passports, national ID images, face scans, and liveness media are not stored in Firebase. If no provider is configured, the UI shows `KYC provider not configured yet.`

## Sponsor Panel Production Flow

Sponsor onboarding accepts URLs with or without protocol and normalizes them safely. Logo and banner URLs show previews and clear errors on failed image load.

Sponsor tools remain gated by:

- sponsor verification status
- active/trialing sponsor subscription

Approved but unpaid sponsors see the plan prompt. Approved and paid sponsors see the Brand Command Center.

## Generated Revenue Split

Initial monetary prize money and sponsor prize money remain separate and go 100% to winners after review.

Generated revenue is split:

- 65% winners
- 15% host
- 10% sponsor
- 10% Challenge Suite platform

All releases remain ledger/admin-review only.

## Challenger Vote-Revenue Bonus

Challengers receive a separate pending-review bonus equal to 10% of vote revenue they received. This is separate from the generated revenue split and is not paid automatically.

## Prediction Arena Rules

Public UI uses **Prediction Arena** only.

Prediction Arena is:

- DoroCoin-only
- not cash betting
- not convertible to cash
- subject to age/region/terms gate foundation
- feature-flag/admin-review controlled
- closed before challenge start
- settled only after final result lock and admin review

Platform fee foundation: 7% of each DoroCoin stake.

## Voter Points and Prize Wheel

Users earn voter points when they buy votes with DoroCoins. Tier thresholds can award spin credits:

- Bronze: 250 points = 1 basic spin
- Silver: 750 points = 1 standard spin
- Gold: 1,500 points = 2 standard spins
- Platinum: 3,000 points = 1 premium spin
- Diamond: 7,500 points = 2 premium spins

Prize wheel prizes are not cash-out prizes by default. High-value/manual prizes require admin fulfillment.

## Admin Review Requirements

Admin can view foundations for:

- KYC metadata
- sponsor review
- revenue share ledgers
- Prediction Arena review
- reward fulfillment
- prize wheel manager

No admin screen executes payouts, withdrawals, refunds, sponsor release, prize release, KYC approval, DoroCoin-to-cash conversion, or fake settlement.

## Security and Rules Notes

Firestore rules fail closed for:

- KYC metadata
- revenue ledgers
- private invite codes/access
- prediction records
- reward wheel prizes
- spin history
- voter reward events
- tournament internal data

Rules were updated locally only and still require controlled manual publication after staging QA.

## Remaining Risks

- KYC provider integration is not configured.
- Media uploads remain fail-closed until Storage QA is complete.
- Prize/revenue/prediction/reward settlement needs admin-provider workflows before production activation.
- Sponsor campaign builder remains a command-center foundation.

## QA Checklist

- Verify free users see `Free Basic Challenges Used: x of 3`.
- Confirm the fourth free basic publish is blocked server-side.
- Confirm private challenges do not appear in public challenge lists, feed, leaderboards, search, or sitemap.
- Validate invite code access creates `privateChallengeAccess`.
- Confirm external livestream UI never implies native streaming.
- Confirm KYC pages do not upload/store raw identity media.
- Confirm sponsor `brand.com` normalizes and saves.
- Confirm logo/banner preview failure shows a clear error.
- Confirm revenue split example matches 65/15/10/10.
- Confirm Prediction Arena never uses public “betting” language.
- Confirm reward spins require spin credits.
- Confirm all sensitive collections are server/admin-only.
