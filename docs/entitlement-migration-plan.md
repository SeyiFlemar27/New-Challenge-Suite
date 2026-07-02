# Existing Account Entitlement Audit And Migration Plan

## Why This Audit Exists

Before Phase 5.2, signup role selection could write paid `creator` or `sponsor_starter` plan fields without a verified Stripe subscription. New signup now always starts on `free`, but existing records must be reviewed before they are changed.

This process is intentionally non-destructive. The audit reads Firestore and produces a report. It does not update or delete records.

## Risky Collections And Fields

The audit reconciles:

- `users/{userId}`
- `profiles/{userId}`
- `stripeSubscriptions/{stripeSubscriptionId}`

Entitlement indicators include:

- `planId`
- `subscriptionPlan`
- `subscriptionPlanId`
- `subscriptionTier`
- `subscriptionStatus`
- `planStatus`
- `role`
- `accountType`
- `dashboardType`
- `stripeCustomerId`
- `stripeSubscriptionId`
- `stripeStatus`
- `entitlementStatus`
- `createdAt`
- `updatedAt`

Role and account type describe product routing or account intent. They are not proof of paid entitlement.

## What Counts As Suspicious

A paid plan is flagged for manual review when one or more of these conditions is true:

- No `stripeSubscriptionId` exists on the user/profile.
- No matching active `stripeSubscriptions` record exists for the user.
- The subscription record lacks a verified webhook event reference.
- The subscription is not internally active and Stripe `active` or `trialing`.
- The paid plan does not match the trusted subscription plan.
- `users` and `profiles` disagree about the plan.

Obvious `demo-*` records are reported separately and must not be treated as real-user migration candidates.

## Running The Read-Only Audit

Do not run this against production until the project and credentials have been reviewed.

The command requires both a dry-run marker and an exact project confirmation:

```powershell
pnpm.cmd audit:entitlements -- --dry-run --project=<firebase-project-id>
```

Optionally bound each collection scan:

```powershell
pnpm.cmd audit:entitlements -- --dry-run --project=<firebase-project-id> --limit=5000
```

The script loads `.env.local`/`.env` through `@next/env`, uses Firebase Admin, performs reads only, and prints hashed account/subscription references. It never prints names, email addresses, raw user IDs, credentials, or private keys.

## Reviewing Results

1. Separate `demo` records from real-user findings.
2. Inspect each real-user finding in the Firebase console using authorized operational access.
3. Confirm the corresponding Stripe customer and subscription in Stripe test/live mode as appropriate.
4. Confirm the subscription Price ID maps to the expected canonical plan.
5. Record the decision and reviewer before any migration.

An empty report does not prove every record was scanned if the configured limit was reached. Increase the limit or add a controlled paginated export for a larger production dataset.

## Future Migration Strategy

Any migration must be a separate, explicitly approved script with its own dry-run output.

- Preserve accounts backed by a valid active/trialing Stripe subscription.
- For unsupported paid fields, change entitlement fields to `free`.
- Preserve `role`, `roleIntent`, `accountType`, `dashboardType`, creator intent, sponsor onboarding, and sponsor profile data.
- Preserve public profile content and account history.
- Do not delete Stripe subscription history.
- Write an `auditLogs` record containing actor, reason, before/after entitlement fields, and timestamp.
- Use Firestore transactions or bounded batches.
- Re-run the read-only audit after migration.

## Prohibited Automatic Changes

Do not automatically:

- Downgrade every account missing a local Stripe ID without manual Stripe verification.
- Change creator/sponsor account intent.
- Delete users, profiles, sponsor profiles, or subscription history.
- Modify wallets, DoroCoins, cash foundations, payouts, refunds, disputes, or KYC data.
- Treat seeded demo records as real subscriptions.
