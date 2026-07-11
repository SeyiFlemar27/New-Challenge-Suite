# Phase 7.5G - Rewards Spin Wheel Live QA

## Deployment Verification

Production deployment was confirmed through the Vercel connector.

- Project: `challenge-suite`
- Deployment state: `READY`
- Target: `production`
- Commit: `b0194353397e6696facc0b36602c72b28e2604d5`
- Commit message: `Build production rewards spin wheel system`

Live route smoke checks returned `200` for:

- `/rewards`
- `/rewards/wheel`
- `/rewards/history`
- `/admin/rewards`
- `/admin/rewards/prize-wheel`
- `/admin/rewards/settings`
- `/admin/rewards/campaigns`
- `/admin/rewards/spins`
- `/admin/rewards/fulfilment`

## User Rewards Route QA

Unauthenticated live route smoke passed for the user-facing rewards pages. Source review confirms the user rewards pages load reward data from backend APIs rather than hard-coded frontend balances.

Reviewed behavior:

- `/rewards` loads summary data through backend reward summary APIs.
- `/rewards/wheel` renders Basic, Standard, and Premium tier selection.
- `/rewards/wheel` shows a circular animated wheel and active prize list.
- `/rewards/wheel` sends only selected tier and optional idempotency key to the server.
- `/rewards/history` loads spin and claim history from server APIs.
- Empty history state is present.
- Manual prize claim modal is present for manual rewards.

Unauthenticated API checks returned expected `401` for:

- `GET /api/rewards/summary`
- `GET /api/rewards/history`
- `POST /api/rewards/spin`
- `POST /api/rewards/claim`

Credentialed user-state QA is still required for real balances, real spin credits, and history rendering.

## Admin Rewards Route QA

Unauthenticated live route smoke returned `200` for admin page shells, and source/API review confirms admin reward data APIs require admin authentication.

Reviewed admin areas:

- `/admin/rewards`
- `/admin/rewards/prize-wheel`
- `/admin/rewards/settings`
- `/admin/rewards/campaigns`
- `/admin/rewards/spins`
- `/admin/rewards/fulfilment`

Unauthenticated API checks returned expected `401` for:

- `GET /api/admin/rewards/prizes`
- `GET /api/admin/rewards/settings`

Source review confirms admin APIs use `requireAdminUser` for prize, campaign, settings, spin, claim, and fulfilment operations.

Admin credentialed QA is still required to create/edit/archive prizes, configure settings, create campaigns, and update fulfilment states.

## Prize Setup QA

Production data creation was not performed.

Source review confirms:

- Admin prize APIs support create, update, and archive foundations.
- Prize tier is normalized to `basic`, `standard`, or `premium`.
- Prize type, fulfilment type, probability weight, quantity, remaining inventory, campaign/date fields, terms, and image URL are supported.
- Inactive, disabled, expired, out-of-window, and out-of-stock configured prizes are excluded by server-side availability checks.
- Public prize payloads do not expose server-only selection internals beyond safe display data.
- UI copy states that prize chances vary by reward availability and campaign configuration.

P1 note: the server still has a default fallback prize set when no configured admin prizes exist. This is useful for continuity but should be replaced by admin-seeded production prizes before broad launch if the product requirement is no default fallback prize pool.

## Spin Eligibility QA

Source review confirms server-side eligibility checks for:

- rewards disabled
- maintenance mode
- tier disabled
- campaign not started
- campaign ended
- account suspended
- no matching tier spin credit
- daily spin limit reached
- user lifetime spin limit reached
- no active prizes
- email verification when configured

Tier-specific behavior is enforced by checking and decrementing `credits[input.tier]`. Basic credits cannot be used on Standard or Premium, and Standard credits cannot be used on Premium.

Credentialed QA is still required for visible disabled messages across each account/campaign state.

## Server-Side Spin Transaction QA

Source review confirms `POST /api/rewards/spin` and the legacy `POST /api/rewards` spin path are authenticated and call the same server spin executor.

The spin executor:

- validates selected tier
- supports idempotency keys
- creates a deterministic spin result ID when idempotency key is supplied
- checks for an existing spin result before processing
- loads settings, active campaign, user, reward profile, daily usage, total usage, and active prizes
- validates matching tier credit server-side
- selects the prize server-side using weighted random selection
- checks active prize state inside the transaction
- checks and decrements limited inventory inside the transaction
- deducts one matching spin credit inside the transaction
- creates immutable spin result records
- creates user spin history records
- creates manual claim/fulfilment records or automatic award records
- creates reward audit logs
- records `cashOutEnabled: false`

No evidence was found that the browser can choose the prize result or grant itself points/credits.

P1 note: the prize is initially selected just before the Firestore transaction and then revalidated inside the transaction. If the selected configured prize becomes unavailable during the transaction, the request fails safely rather than reselecting a different prize.

## Reward History And Claim QA

Source review confirms:

- `GET /api/rewards/history` returns only records where `userId == authenticated user`.
- `GET /api/rewards/claims/[claimId]` rejects claims owned by another user.
- `POST /api/rewards/claim` requires authentication.
- Claim submission checks ownership.
- Duplicate claim submission is blocked unless the claim is awaiting claim or was rejected.
- Claim records include claim reference, status, fulfilment status, and audit log.
- Admin claim update APIs require admin access.

Credentialed manual-claim QA is still required with a real manual reward spin result.

## Automatic Reward QA

Source review confirms automatic digital reward side effects are created only after the spin transaction reaches the reward side-effect step.

Supported foundation behavior:

- DoroCoin bonus creates wallet/reward transaction records.
- Automatic award records are created under the user reward profile.
- Try-again style rewards resolve to no-reward/completed status.
- Manual prizes create claim and fulfilment records instead of automatic fulfilment.
- Cash-out remains disabled.
- No DoroCoin-to-cash conversion was added.

P1 note: several automatic reward types remain foundation-level and need full downstream application testing, such as boost credits, badges, coupons, subscription discounts, and feature access.

## DoroCoin Purchase Points QA

Source review confirms reward points are awarded only through `awardDoroCoinPurchaseRewards`, which is called from the Stripe webhook-confirmed DoroCoin purchase path.

Safety confirmed:

- Stripe webhook verifies paid payment session before DoroCoin/reward handling.
- Reward event IDs are deterministic from purchase source, Stripe event, and user.
- Duplicate reward events are ignored.
- Point transactions are recorded under `userRewards/{userId}/pointTransactions`.
- `voterRewardEvents` stores the processed reward event.
- Reward audit log is created.
- Spin credits are tier-specific.
- No frontend route grants reward points or spin credits directly.

Live Stripe/DoroCoin purchase QA was not performed because production test purchase execution was not approved in this phase.

## Refund/Reversal QA

Refund/reversal behavior remains foundation/documented only.

Reviewed status:

- Source/payment/points/spin relationships are recorded enough for admin review.
- No automatic refund execution was added.
- No automatic deletion of fulfilled prizes was added.
- No cash refund flow was newly activated.

Full refund/reversal automation remains a P1 item.

## Notifications Foundation QA

Notifications remain foundation/log-ready.

Reviewed status:

- Reward point awards, spin completion, claim submission, admin prize changes, settings changes, campaign changes, and fulfilment updates create audit records.
- Email provider activation was not added.
- No notification delivery side effects were found that would spam users from retried requests.

P1: in-app user notification records for every reward event should be connected once the notification UX is ready.

## Firestore/API Security QA

Firestore rules were reviewed for reward collections.

Fail-closed collections include:

- `rewardSettings`
- `rewardCampaigns`
- `rewardPrizes`
- `userRewards`
- `spinResults`
- `rewardClaims`
- `rewardFulfilments`
- `rewardFulfillments`
- `rewardAuditLogs`
- `rewardDailySpinUsage`
- `rewardUserSpinUsage`

API review confirms:

- normal users cannot create rewards directly
- normal users cannot edit reward points
- normal users cannot edit spin credits
- normal users cannot edit prize weights
- normal users cannot mark fulfilment complete
- users can only access their own reward history and claims through server APIs
- admin prize/settings/campaign/spin/claim/fulfilment APIs require admin authentication

Firestore rules should not be broadly published until credentialed rewards QA passes.

Storage rules were not changed in this phase and should remain unpublished until upload QA is complete.

## Mobile And Responsive QA

Live route smoke passed, and source review confirms responsive layout patterns are present:

- rewards dashboard cards use responsive grids
- wheel page constrains the wheel with `aspect-square` and max width
- tier buttons wrap
- history modal uses max viewport height and scrolls
- admin pages use responsive grid/table patterns

Browser screenshot QA at 360px, 390px, 430px, 768px, 1024px, and desktop was not executed in this phase because no browser automation/browser session was available in the approved task context. This remains a QA requirement.

## Incomplete Flow Findings

No P0 safety issue was found in source/API review.

Findings to carry forward:

- Default fallback prize data exists server-side when no admin prizes are configured. This should be seeded/replaced with production admin prizes before launch.
- Credentialed admin QA is still needed for creating, editing, archiving, and pausing prizes.
- Credentialed user QA is still needed for no-credit, one-credit, successful spin, duplicate spin, and result-history flows.
- Real Stripe/DoroCoin test purchase QA is still needed to prove points and spin-credit unlocks end to end.
- Manual prize claim/fulfilment needs seeded manual prize records.
- Automatic reward types beyond DoroCoin bonus need downstream application testing.
- Mobile screenshot QA is still needed.
- Large admin data sets still need search/pagination stress testing.

## Remaining P0 Blockers

- Credentialed staging/admin test accounts are required.
- Controlled reward prize/settings/campaign seed data is required.
- Real or sandbox Stripe/DoroCoin webhook test is required for purchase-points QA.
- Firestore rules must remain unpublished broadly until credentialed rewards QA passes.
- Mobile screenshot QA has not been executed.

## Remaining P1 Issues

- Replace or intentionally disable server default fallback prizes after admin production prizes are seeded.
- Full refund/reversal automation for DoroCoin purchase refunds.
- In-app reward notification delivery.
- Email notification provider integration.
- Admin search/filter/pagination polish for large reward operations.
- Export tools for fulfilment records.
- More granular fraud/risk scoring.
- Full downstream fulfillment for all automatic reward types.

## Recommended Next Phase

Phase 7.5H should be credentialed staging execution for rewards:

- create admin reward settings
- create active Basic, Standard, Premium prizes
- create one manual prize
- create one limited-inventory prize
- seed a user with Basic/Standard/Premium spin credits
- run live spin tests with idempotency replay
- test duplicate click behavior
- test manual claim submission
- test admin fulfilment update
- run Stripe/DoroCoin sandbox webhook purchase test
- capture mobile screenshots

