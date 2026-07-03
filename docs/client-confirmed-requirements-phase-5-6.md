# Phase 5.6 Client-Confirmed Requirements

## Implemented decisions

- All public, dashboard, sidebar, and mobile Create Challenge entry points use `/challenges/create`.
- Homepage offers Explore Challenges and Create Challenge as primary actions.
- Challenge creation accepts date and time values for start, entry deadline, voting deadline, and end.
- Challenge records support standard rules, policy terms, guidelines, trailer, promo video, and flyer metadata.
- Prize metadata supports money, physical product, digital product, and bragging-rights types.
- Money and physical prizes enter platform review. Paid entry, payout execution, and prize release remain disabled.
- Public jackpot metadata uses an 85% visible allocation and keeps the 15% platform allocation admin-only. No entry fee or payout execution is enabled.
- Host and Enterprise accounts can submit 1v1, group, and tournament bracket foundations with 2, 4, or 6 divisions and a maximum of 50 participants.
- Scoring supports best-of 3, 5, or 7, points-based scoring, and positive timer values.
- Physical/live challenge metadata supports venue, address, city, state, country, map URL, capacity, event review, and event sync status.
- Approved live-event challenges can be synced into `liveEvents` by the guarded admin review route.
- Interested, Save Challenge, and Watch Later preferences persist through server routes.
- Reminder preferences store 60, 30, 5, and 0 minute offsets with `pending_worker`; no notification delivery is faked.
- Challenge comments support authenticated posting, public approved/active reads, and moderation status foundations.
- Challenge/feed cards expose a Watch Challenge action.
- Free voting remains server-enforced at one free vote per challenge per day.
- Wallet keeps Stripe-backed DoroCoin package checkout and includes a clearly inactive ad-reward placeholder.
- Sponsor profiles require `sponsorVerificationStatus: approved` before contribution proposals.
- Sponsor subscriptions remain separate from campaign and sponsorship contribution budgets.
- Sponsors can message creators/hosts before sponsoring; messages do not reserve slots or move money.
- Challenges can define sponsor packages, prices, benefits, and slot limits.
- Sponsor proposals validate approved CTA labels and URLs.
- Sponsorship split terms default to 12% sponsor arrangement and 3% creator arrangement, are configurable, and require sponsor, creator, and platform approval.
- No investment return is promised. The terms are named sponsorship split/return arrangements.
- Subscription cancellation requests go to Stripe; access downgrades only after a verified webhook.
- `cancel_at_period_end` is treated as an immediate entitlement cancellation after webhook confirmation.
- The first two failed subscription payment events retain access with `payment_warning_1` and `payment_warning_2`; a later failure downgrades to Free.
- Challenge Suite gold/black tokens replace mismatched blue primary states in the core pages touched by this batch.
- The guarded `/admin/review` foundation can approve/reject sponsors, challenge/prize/event metadata, and mutually agreed sponsor arrangements.

## Safe placeholders

- Media upload fields save validated URL metadata only. Storage upload orchestration is not connected.
- Tournament brackets are configuration/preview foundations. Tournament execution and tournament payouts are inactive.
- Live-event reminders are preferences only until a notification worker is connected.
- Ad rewards are UI-only. No ad network, reward verification, or DoroCoin granting exists.
- Program/Campaign challenge builders remain draft-only.
- Admin review can approve visibility and metadata. It cannot execute payouts, refunds, withdrawals, or sponsor release.
- Revenue, prize pool, cash wallet, and payout views remain review/status foundations.

## Pending client decisions

- Exact monthly plan prices.
- Yearly prices and discounts.
- Monthly DoroCoin allowance by plan.
- Sponsor plan prices.
- Final launch plan list.
- Final launch feature and delayed-feature lists.
- Enterprise Checkout versus Contact Sales.

## Financial and compliance locks

- No automatic payouts or withdrawals.
- No automatic refunds.
- No sponsor money capture or release.
- No paid-entry jackpot payout execution.
- No DoroCoin-to-cash conversion.
- No KYC processing.
- No admin payout execution.
- No ad-reward fulfillment.
- Stripe subscription and DoroCoin fulfillment remain verified-webhook-only.

## Routes touched or added

- `/`
- `/landing`
- `/challenges/create`
- `/challenges/[id]`
- `/challenges/[id]/sponsor`
- `/live-events`
- `/wallet`
- `/subscriptions`
- `/sponsor/dashboard`
- `/sponsor/messages`
- `/admin/review`
- `/api/challenges`
- `/api/challenges/[id]`
- `/api/challenges/[id]/comments`
- `/api/challenges/[id]/engagement`
- `/api/challenges/[id]/sponsorships`
- `/api/sponsorships/[id]/approval`
- `/api/sponsor/messages`
- `/api/admin/reviews`
- `/api/stripe/subscription`
- `/api/stripe/webhook`

## Manual verification checklist

1. Confirm Free cannot publish private, sponsored, ranked, live-event, or tournament challenges.
2. Confirm Creator can configure sponsor packages but not tournaments.
3. Confirm Pro can configure ranked challenges and preview/join tournaments, but cannot create full brackets.
4. Confirm Host/Enterprise can submit tournament/live-event configurations for review.
5. Confirm a physical or money-prize challenge becomes `pending_review`.
6. Confirm public challenge API does not return the platform 15% allocation.
7. Confirm pending sponsors cannot submit sponsorship proposals.
8. Confirm sponsor and creator approvals are both required before platform review.
9. Confirm admin review never changes money movement flags from false/not active.
10. Confirm comments, saved, watch later, and interested preferences persist.
11. Confirm reminder text says delivery is pending a worker.
12. Confirm free voting is blocked after one free vote on the same challenge/date.
13. Confirm ad reward UI cannot grant DoroCoins.
14. Confirm subscription checkout and success pages do not change entitlement.
15. Confirm cancellation/payment failure access changes only after verified Stripe webhooks.
