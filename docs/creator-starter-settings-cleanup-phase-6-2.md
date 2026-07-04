# Phase 6.2: Creator Starter and Settings Cleanup

## Effective tier mapping

- Free user or competitor: `Free Competitor`
- Free account with creator intent: `Creator Starter` / `Free Creator`
- Free account with host intent: `Host Starter`
- Active or trialing Creator subscription: `Creator Plan` / `Creator Member`
- Active or trialing Pro, Host, or Enterprise subscriptions use their paid plan labels
- Sponsor accounts retain the separate Brand Command Center access model

Account intent does not grant paid entitlement. Paid labels and permissions require a canonical paid plan plus an `active`, `trial`, or `trialing` subscription status.

## Creator Starter

Creator Starter can create one basic public non-monetized challenge per month. The basic form includes title, category, description, rules, basic cover media, image/video submission type, and dates. Draft saving and publishing use the existing server route.

Private challenges, paid entry, prize pools, sponsorships, boosts, advanced voting, promo media, creator earnings, withdrawals, host tools, tournaments, and live events remain unavailable. Monthly and feature limits remain server-enforced.

Paid Creator members continue to receive the full Creator wizard according to the existing Creator plan limits.

## Labels

Dashboard, sidebar, private profile, public profile, and settings use the central effective-tier label. Creator-intent accounts on Free no longer present themselves as paid Creator members or generic Free Explorers.

Sidebar route matching remains specific: `/challenges/create`, `/my-challenges`, and `/my-entries` win before broader challenge routes.

## Settings

The Settings home now presents focused category rows:

- Account
- Profile
- Appearance
- Notifications
- Privacy
- Security
- Billing & Subscription
- Wallet & DoroCoin
- Challenge Preferences
- Danger Zone

Editable settings continue to persist through the authenticated settings API. Appearance stores `system`, `light`, or `dark` as a safe preference foundation.

## Billing and cancellation

The pricing page shows a compact current-plan summary and links to `/settings/billing`. Cancellation is available only in Billing and requires an explicit confirmation. The existing Stripe subscription endpoint and verified webhook lifecycle remain unchanged.

## Danger Zone

Deactivate and Delete are protected placeholders. Delete requires typing `DELETE`, but permanent deletion remains disabled until a reviewed server-side deletion and retention workflow exists.

## QA checklist

- Free competitor displays Free Competitor labels and cannot create challenges.
- Creator-intent Free account displays Creator Starter and Free Creator labels.
- Creator Starter receives the basic public challenge form and can save a draft.
- Active/trialing Creator subscription displays Creator Plan and receives the full wizard.
- Inactive or canceled paid plan records do not display paid entitlement.
- Only one sidebar route is active at a time.
- Pricing page contains no cancellation action.
- Billing cancellation requires confirmation.
- Appearance and editable settings save through `/api/settings`.
- Danger Zone cannot deactivate or permanently delete an account.
- Stripe checkout, webhook fulfillment, DoroCoin fulfillment, payouts, withdrawals, and prize release remain unchanged.
