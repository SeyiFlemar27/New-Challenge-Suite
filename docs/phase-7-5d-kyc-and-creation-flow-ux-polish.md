# Phase 7.5D: KYC and Creation Flow UX Polish

## Summary

This phase targets user-facing polish for the Sumsub KYC flow and removes the confusing broad competition-type selector from active creation builders. It also differentiates Hybrid Competition from a normal challenge by giving it a dedicated builder, stepper, copy, and data foundation.

No payout, withdrawal, refund, sponsor release, prize release, fake KYC approval, raw ID storage, raw selfie/face scan storage, or real-money Prediction Arena settlement behavior was activated.

## KYC UX Changes

The KYC experience now follows a standard identity-verification pattern instead of exposing technical provider states as the main user message.

### `/kyc`

The overview page now presents:

- Hero title: `Verify your identity`
- Clear premium-sensitive feature copy
- Friendly status pill labels, including `Temporarily unavailable` instead of a raw provider-error headline
- Primary and secondary CTAs based on the current KYC state
- Four main education cards:
  - Government ID
  - Face verification
  - Secure review
  - Unlock premium tools
- Trust and security notes explaining that Sumsub handles the identity check and Challenge Suite stores only verification status/provider metadata.

### `/kyc/start`

The start page now includes:

- A preparation checklist before launching Sumsub
- A clear `Continue to secure verification` CTA
- A polished `Preparing secure verification` loading state
- No large blank SDK container before launch
- A user-friendly unavailable state with Retry, View Status, and Contact Support actions

Provider or SDK failures are now surfaced as `Verification is temporarily unavailable` for normal users. Internal `provider_error` status can still be stored for diagnostics.

### `/kyc/status`

The status page now maps Challenge Suite KYC statuses into clear user copy:

- `not_required`: verification is not required for the current plan
- `required` / `not_started`: verification required
- `in_progress`: verification in progress
- `pending_review`: verification under review
- `verified`: identity verified
- `rejected`: verification was not approved
- `needs_resubmission`: action required
- `provider_error` / `provider_unavailable`: temporarily unavailable
- `expired`: session expired

### `/kyc/success`

The success page now shows a premium verified state, completion date when available, what may unlock, and an explicit reminder that identity verification does not automatically trigger payouts, withdrawals, refunds, sponsor releases, or prize releases.

### `/kyc/failed`

The failed/resubmission page now gives a recovery path with safe reason copy, Try Again and Contact Support actions, and document/selfie quality tips. It does not expose raw provider payloads.

## KYC Safety Preserved

- Free users are not forced into KYC.
- Premium pending KYC users can still use free/basic features.
- Premium-sensitive features remain gated until verified where required.
- Sumsub remains responsible for ID, selfie, and liveness verification.
- Challenge Suite stores only metadata/status, not raw ID documents or face media.
- Webhook approval remains the source of truth.
- No fake approval path was added.
- Webhook signature verification and idempotency were not weakened.

## Creation Selector Removal

The old active builder pattern that asked users to choose between `Online Challenge`, `Private Challenge`, `Live Event`, `Tournament`, and `Hybrid Competition` inside a generic create form has been removed from the targeted active builders.

Remaining mentions of those labels are intended for navigation, page titles, locked feature cards, route context, review summaries, or documentation. They are no longer presented as a broad selector inside the active creation form.

## Route Map

### Free

- `/challenges/create`: Create Free Basic Challenge / normal public challenge flow.
- Private, live, tournament, and hybrid capabilities appear as upgrade education elsewhere rather than as selectable active form types.

### Creator

- `/challenges/create`: normal creator challenge flow.
- `/private/create`: private challenge builder entry with plan-limit messaging/foundation.

### Host

- `/host/challenges/create`: Create Challenge
- `/host/private/create`: Create Private Challenge
- `/host/live/create`: Create Live Event
- `/host/tournaments/create`: Create Tournament Challenge
- `/host/hybrid/create`: Create Hybrid Competition

### Enterprise

Enterprise access remains section-based conceptually:

- Programs/Campaigns
- Enterprise Challenge
- Private Campaign
- Tournament
- Live Event
- Hybrid Competition

The old broad type selector is not used as an active enterprise builder pattern.

### Sponsor

- `/sponsor/campaigns/create`: Sponsor campaign foundation

Sponsors are routed toward campaign, sponsorship, placement, reporting, budget, and billing flows rather than the normal challenge-type selector.

## Hybrid Competition Definition

Hybrid Competition is now defined as a multi-stage competition combining online participation with a live, scheduled, or judged final stage.

Use Hybrid Competition when participants qualify online before advancing to a final round.

## Hybrid Builder Fields

The dedicated Hybrid builder includes these steps:

1. Basic Details
2. Online Qualification
3. Shortlist Rules
4. Final Round
5. Scoring & Judges
6. Media
7. Review & Publish

The builder captures:

- title, description, category, cover image
- online submission start date and deadline
- accepted media type
- max submission length and file size
- qualification method: public vote, judge review, host selection, or mixed
- number of finalists
- finalist announcement date
- advancement rules
- final round type: live physical event, virtual live session, scheduled online final, or hybrid live + online
- final date/time
- venue/location
- external livestream placeholder/status
- final submission/judging requirements
- audience vote weight
- judge score weight
- host review weight
- tie-breaker rule
- judge names/emails foundation
- judging criteria
- judge score visibility
- final winner flow and admin review foundation

## Locked Feature Behavior

Locked feature messaging should remain visible and upgrade-oriented:

- Free users see private challenge creation as a Creator feature.
- Creator private limits can route to Host upgrades.
- Live Event and Hybrid Competition copy route users toward Host where required.
- Locked states should explain the benefit, requirement, and next CTA instead of hiding the feature completely.

## Sidebar and Menu Alignment

Host navigation now points to dedicated creation routes:

- Create Challenge -> `/host/challenges/create`
- Create Private Challenge -> `/host/private/create`
- Create Live Event -> `/host/live/create`
- Create Tournament -> `/host/tournaments/create`
- Create Hybrid -> `/host/hybrid/create`

The generic create flow focuses on normal/basic public challenges.

## Provider Unavailable Fallback

User-facing copy now says:

`Verification is temporarily unavailable`

instead of presenting a scary or technical `Provider Error` headline. Retry, status, and support actions are available.

## Remaining P0 Blockers

- Sumsub sandbox credentials and dashboard setup still require live/manual verification.
- Credentialed browser QA for KYC start/status/success/failure still needs real test accounts.
- Dedicated creation routes need browser QA across Free, Creator, Host, Enterprise, and Sponsor contexts.

## Remaining P1 Issues

- Enterprise-specific builder routes are still conceptual/foundation and may need a dedicated implementation phase.
- Sponsor campaign creation remains a foundation flow and needs backend/admin workflow completion later.
- Private challenge monthly limit messaging should be tested with seeded plan states.
- Hybrid builder should receive fixture-based QA before broad launch.

## QA Checklist

- [ ] `/kyc` shows a polished overview with no raw provider-error headline.
- [ ] `/kyc/start` shows checklist before SDK launch and no large blank SDK box.
- [ ] `/kyc/status` maps every KYC state to clean copy.
- [ ] `/kyc/success` confirms verified state without implying automatic payouts.
- [ ] `/kyc/failed` shows safe recovery copy and no raw provider payload.
- [ ] Free users are not forced into KYC.
- [ ] Premium pending KYC users are gated from premium-sensitive tools only.
- [ ] `/challenges/create` does not show the old broad competition-type selector.
- [ ] `/private/create` routes to private challenge creation context.
- [ ] `/live/create` and `/host/live/create` route to live event creation context.
- [ ] `/tournaments/create` and `/host/tournaments/create` route to tournament creation context.
- [ ] `/hybrid/create` and `/host/hybrid/create` route to the Hybrid Competition builder.
- [ ] Host sidebar create actions open dedicated builders.
- [ ] Sponsor campaign creation does not show the normal challenge type selector.
- [ ] Hybrid builder fields remain usable at 360px, 390px, 430px, 768px, and desktop widths.
- [ ] Typecheck passes.
- [ ] Build passes.