# Plan Tier Verification

Use verified test accounts whose paid plans were activated by Stripe webhook processing. Role selection alone must not unlock these experiences.

## Dashboard And Navigation

| Plan | Dashboard | Navigation checks |
| --- | --- | --- |
| Free | User Dashboard | Explore, basic create, leaderboard, and wallet remain visible. Private, tournament, live-event, Host, boost, and advanced analytics tools are absent or locked. |
| Creator | Creator Studio | Private challenges, sponsor-ready creation, Creator analytics, one monthly boost, and read-only earnings review are visible. |
| Pro | Performance Hub | Ranked challenge, performance, tournament preview, ranking, multiplier, and three monthly boost tools are visible. Host Control Center remains locked. |
| Host | Host Control Center | Host route, participant/submission/voting control foundations, live events, tournament builder drafts, reports, exports, and three team seats are visible. |
| Enterprise | Enterprise Command Center | Host capabilities plus program/campaign drafts, branded-page, reports, exports, integration, and expanded team foundations are visible. |
| Sponsor | Brand Command Center | `/dashboard` routes to sponsor onboarding/dashboard. Normal create and Host navigation are not the sponsor's primary experience. |

## Direct Route Checks

- Free and Creator opening `/dashboard/host` see a polished Host-plan lock.
- Free, Creator, and Pro opening `/dashboard/host/team` see a polished Host-plan lock.
- Free and Creator opening `/tournaments` see a Pro-plan lock.
- Free, Creator, and Pro opening `/live-events` see a Host-plan lock.
- Free opening a challenge boost route sees a Creator-plan lock; the API also rejects the spend.
- Normal users opening sponsor APIs receive sponsor-account permission errors.

## Challenge Builder

- Free: public Group/Entry formats only; private, sponsor, prize, weighted voting, moderation, tournaments, and live events are locked.
- Creator: private, sponsor-enabled, product/DoroCoin prize review, and one monthly boost are available.
- Pro: ranked format and weighted vote controls are available.
- Host: 1v1 is available; tournament/live-event formats are draft-only; submission approval control is available.
- Enterprise: program/campaign formats are draft-only.
- All plans: paid entry, cash payouts, automatic refunds, sponsor release, and prize-pool release remain disabled.

## Subscription Safety

- Cancelled, expired, past-due, incomplete, or paused user subscriptions render Free experience access.
- Sponsor routing remains separate from paid sponsor entitlement.
- Checkout and success pages do not activate plans.
- Only verified Stripe webhook lifecycle writes update paid plan status.

## Financial Safety

- Revenue and earnings surfaces are read-only review foundations.
- No plan exposes withdrawals, payout execution, automatic refunds, sponsor money release, KYC processing, paid-entry prize-pool release, or DoroCoin-to-cash conversion.
