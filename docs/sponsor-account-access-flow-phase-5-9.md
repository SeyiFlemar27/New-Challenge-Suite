# Phase 5.9 Account Type And Sponsor Access Flow

## Account Type Selection

New accounts are created with free entitlement and an incomplete account-type selection flag. After email verification, `/onboarding/account-type` records the user's intent:

| Selection | `account_type` | `dashboard_type` | `role_intent` |
| --- | --- | --- | --- |
| Competitor | `user` | `user_dashboard` | `compete` |
| Creator | `creator` | `creator_studio` | `create` |
| Host | `host` | `host_control_center` | `host` |
| Brand / Sponsor | `sponsor` | `sponsor_dashboard` | `sponsor` |

Selection does not change `planId`, `subscriptionStatus`, Stripe fields, or paid entitlement. Verified Stripe webhook processing remains the source of truth for paid plans.

## Sponsor Flow

1. Choose Brand / Sponsor account type.
2. Open the Brand Command Center overview.
3. Complete and save the brand profile.
4. Submit the profile for platform review.
5. Receive approval or requested changes.
6. Choose a sponsor subscription plan.
7. Stripe webhook confirms an active or trialing subscription.
8. Full sponsor tools unlock only when the account is a sponsor, the brand is approved, and the sponsor subscription is active.

## Review And Subscription States

Review states: `not_submitted`, `draft`, `submitted`, `pending_review`, `approved`, `rejected`, `needs_changes`, `suspended`.

Subscription states: `none`, `incomplete`, `trialing`, `active`, `past_due`, `canceled`, `unpaid`.

## Access Matrix

| State | Available | Locked |
| --- | --- | --- |
| Not submitted / draft | Overview, Brand Profile, Sponsor Plans, Settings | Campaigns, sponsor challenges, placements, insights, reports, billing, team, creator messaging |
| Submitted / pending review | Overview, Brand Profile, Sponsor Plans, Settings | Full sponsor tools until approval |
| Approved but unpaid | Overview, Brand Profile, Sponsor Plans, subscription billing | Full sponsor tools until subscription activation |
| Paid but unapproved | Overview, Brand Profile, Sponsor Plans, limited billing | Full sponsor tools until approval |
| Approved and active/trialing | Full sponsor workspace according to plan limits | Features outside the active plan |
| Rejected / needs changes | Overview, profile editing, feedback, resubmission, plans, settings | Full sponsor tools |
| Suspended | Settings and support messaging | All operational sponsor tools |

Locked navigation remains clickable and opens a status-aware explanation with the appropriate profile, review, plan, or support action.

## Sponsor Plans

`/sponsor/plans` shows Sponsor Starter, Brand Partner, and Enterprise Partner from the normalized subscription catalog. Enterprise Partner uses Contact Sales when no online Stripe Price is configured.

Sponsor subscriptions unlock software tools and placement rights. Campaign budgets, sponsorship amounts, prize funding, and boosts are separate.

## Billing Separation

`/sponsor/billing` separates:

- Sponsor subscription status, plan selection, renewal/invoice placeholders, and subscription controls.
- Campaign budget placeholders for sponsorship payments, prize contributions, boosts, pending items, disputes, and refund reviews.

No sponsor money capture, release, payout, withdrawal, automatic refund, or prize release is enabled.

## QA Checklist

1. Verify a new account reaches account-type selection after email verification.
2. Verify account selection does not change the free plan.
3. Verify competitor, creator, and host selections route to `/dashboard`.
4. Verify sponsor selection routes to `/sponsor/onboarding`.
5. Verify normal users cannot load sponsor profile data.
6. Verify sponsor users are redirected away from the normal dashboard.
7. Verify not-submitted, pending, rejected, and suspended states show appropriate lock copy.
8. Verify approved but unpaid sponsors are directed to `/sponsor/plans`.
9. Verify paid but unapproved sponsors remain locked.
10. Verify approved plus active/trialing sponsors can open sponsor feature workspaces.
11. Verify Team Members additionally respects sponsor plan limits.
12. Verify checkout and success pages never grant access directly.
