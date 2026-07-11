# Phase 7.5F - Production Rewards Spin Wheel System

## Existing Foundation Audit

Phase 7.4J had a useful but incomplete rewards foundation: `/rewards`, `/rewards/wheel`, `/rewards/history`, `/admin/rewards`, `/admin/rewards/prize-wheel`, a monolithic `/api/rewards` route, fallback prize data, server-side spin handling, and DoroCoin purchase reward points from the Stripe webhook. The gaps were admin-managed settings, campaign management, full API separation, fulfillment/claim flow, richer history, inventory protection, anti-fraud records, and production admin navigation.

## Architecture Summary

Phase 7.5F upgrades the existing implementation rather than creating a disconnected demo. Rewards now use backend-loaded settings, campaign-aware prizes, tier-specific credits, server-selected weighted prize results, immutable spin records, claim/fulfillment records for manual prizes, audit logs, and admin APIs.

## Files Added

- `app/api/rewards/summary/route.ts`
- `app/api/rewards/settings/route.ts`
- `app/api/rewards/prizes/route.ts`
- `app/api/rewards/history/route.ts`
- `app/api/rewards/spin/route.ts`
- `app/api/rewards/claim/route.ts`
- `app/api/rewards/claims/[claimId]/route.ts`
- `app/api/admin/rewards/prizes/route.ts`
- `app/api/admin/rewards/prizes/[prizeId]/route.ts`
- `app/api/admin/rewards/settings/route.ts`
- `app/api/admin/rewards/campaigns/route.ts`
- `app/api/admin/rewards/campaigns/[campaignId]/route.ts`
- `app/api/admin/rewards/spins/route.ts`
- `app/api/admin/rewards/claims/route.ts`
- `app/api/admin/rewards/claims/[claimId]/route.ts`
- `app/api/admin/rewards/fulfilments/[fulfilmentId]/route.ts`
- `app/admin/rewards/settings/page.tsx`
- `app/admin/rewards/campaigns/page.tsx`
- `app/admin/rewards/spins/page.tsx`
- `app/admin/rewards/fulfilment/page.tsx`

## Files Modified

- `lib/server/rewards.ts`
- `app/api/rewards/route.ts`
- `app/rewards/page.tsx`
- `app/rewards/wheel/page.tsx`
- `app/rewards/history/page.tsx`
- `app/admin/rewards/page.tsx`
- `app/admin/rewards/prize-wheel/page.tsx`
- `components/admin/admin-shell.tsx`
- `firestore.rules`

## Firestore Schema Changes

The production model now supports:

- `rewardSettings/{settingsId}`
- `rewardCampaigns/{campaignId}`
- `rewardPrizes/{prizeId}`
- `userRewards/{userId}`
- `userRewards/{userId}/pointTransactions/{transactionId}`
- `userRewards/{userId}/spinCredits/{creditId}`
- `userRewards/{userId}/spinHistory/{spinId}`
- `userRewards/{userId}/awards/{awardId}`
- `spinResults/{spinId}`
- `rewardClaims/{claimId}`
- `rewardFulfilments/{fulfilmentId}`
- `rewardFulfillments/{fulfillmentId}` compatibility collection
- `rewardAuditLogs/{logId}`
- `rewardDailySpinUsage/{usageId}`
- `rewardUserSpinUsage/{userId}`

Firestore rules remain fail-closed for these collections. All sensitive writes go through server/admin APIs.

## Point and Spin-Credit Rules

Defaults are backend settings, not frontend constants:

- Basic: 100 points unlocks 1 Basic spin credit.
- Standard: 250 points unlocks 1 Standard spin credit.
- Premium: 500 points unlocks 1 Premium spin credit.

Reward points are awarded only from the Stripe webhook-confirmed DoroCoin purchase path through `awardDoroCoinPurchaseRewards`. The event is idempotent through `voterRewardEvents` and point transactions. Spin credits are tier-specific; a Basic credit cannot be used on Standard or Premium.

## Prize Selection Algorithm

The browser sends only `tier` and an optional idempotency key. The server loads active campaign prizes, excludes inactive/expired/out-of-stock prizes, runs weighted random selection server-side, deducts one matching spin credit, updates limited inventory, creates spin records, and records audit logs in one transaction.

The UI states clearly: prize chances vary by reward availability and campaign configuration.

## User Pages

`/rewards` now shows available/lifetime points, tier-specific credits, next-tier progress, current rules, recent rewards, and DoroCoin purchase CTA.

`/rewards/wheel` now includes Basic/Standard/Premium selection, a circular animated wheel, server-confirmed result modal, disabled states, prize list, recent win path, and mobile-safe layout.

`/rewards/history` now shows spin history and supports manual prize claim submission.

## Admin Pages

`/admin/rewards` is now a reward overview with metrics and links.

`/admin/rewards/prize-wheel` lets admins create and archive prizes with tier, reward type, fulfillment type, probability weight, inventory, terms, and instructions.

`/admin/rewards/settings` exposes thresholds, points calculation, daily limits, support contact, maintenance mode, and high-value KYC setting.

`/admin/rewards/campaigns` adds campaign foundation.

`/admin/rewards/spins` lists server-selected spin history.

`/admin/rewards/fulfilment` lists and updates manual/physical reward claims.

## Fulfillment Flow

Automatic digital rewards create award records. DoroCoin bonus awards create reward transaction records and remain non-cash internal platform credits. Manual and physical prizes create `rewardClaims` and fulfillment records with `awaiting_claim` state. Users can submit claim details, and admins can move claims through review/fulfillment states.

No high-value/manual prize is auto-fulfilled.

## Refund/Reversal Handling

The data model now links Stripe source, DoroCoin source, point transaction, spin credit, spin result, and fulfillment references. Automatic refund execution was not added. If a DoroCoin purchase refund occurs after points/spins are awarded, the system has enough records for an admin review/reversal flow. Full refund reversal automation remains a P1 item.

## Notifications Foundation

Spin credit unlocks, prize wins, claim submission, and fulfillment updates are audit-recorded and can feed in-app/email notifications. Email sending is not activated in this phase.

## Security and Anti-Fraud

- Frontend cannot choose prize results.
- Frontend cannot grant reward points.
- Frontend cannot grant spin credits.
- Spin transactions are idempotent.
- Matching tier credit is deducted in a Firestore transaction.
- Inventory is checked and updated transactionally.
- Daily/user spin limits are enforced from backend settings.
- Claims are user-owned and duplicate claims are blocked.
- Admin changes write audit records.
- Firestore client access remains denied for reward collections.
- No cash-out prize, DoroCoin-to-cash conversion, payout, withdrawal, refund, sponsor release, prize release, or real-money Prediction Arena settlement was activated.

## Remaining P0 Blockers

- Credentialed staging QA is required for real DoroCoin purchase webhook to point/credit unlock flow.
- Firestore rules should not be broadly published until credentialed rewards QA passes.
- Storage rules should remain unpublished until upload QA is complete.

## Remaining P1 Issues

- Full refund/reversal automation for DoroCoin purchase refunds.
- Admin prize editing UI beyond create/archive.
- Advanced filters/search/pagination for large reward operations.
- Notification delivery provider integration.
- Export tools for fulfillment records.
- More granular fraud/risk scoring.

## Testing Checklist

- No spin credits state.
- Basic credit cannot spin Premium.
- Double-click spin does not duplicate result.
- Replayed idempotency key returns existing result.
- Out-of-stock prize is excluded.
- Disabled wheel blocks spin.
- Campaign not started/ended blocks spin.
- Daily spin limit blocks spin.
- Automatic reward creates award record.
- Manual reward creates claim/fulfillment record.
- User cannot claim another user's prize.
- Admin can review fulfillment state.
- Stripe webhook duplicate does not award points twice.
- DoroCoin purchase refund is reviewable.
- Mobile wheel fits 360/390/430/768/desktop widths.
- Reduced-motion/manual QA recommended for wheel animation.
