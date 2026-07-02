# Entitlement Security Verification

Phase 5.2 keeps account intent separate from paid entitlement. Run these checks with the Firebase Emulator Suite before deploying rule changes to production.

## Signup

- Register a normal user and confirm `planId` and `subscriptionPlan` are `free`.
- Register with Creator selected and confirm `role` is `creator` while paid plan fields remain `free`.
- Register with Sponsor selected and confirm `accountType` is `sponsor`, sponsor onboarding is available, and paid plan fields remain `free`.
- Confirm none of these paths writes `creator`, `sponsor_starter`, `brand_partner`, or `enterprise_partner` as an active plan.

## Firestore Client Rules

- Confirm a signed-in user cannot update `users/{uid}` or `profiles/{uid}` directly.
- Confirm the validated profile API can still update supported public profile fields through Firebase Admin.
- Confirm a user can read only their own raw `users` and `profiles` documents.
- Confirm public profile, submission, leaderboard, and winner APIs return only their documented public projection.
- Confirm client reads and writes fail for subscription, webhook, wallet ledger, cash, prize, payout, refund, dispute, claim, and audit collections.

## Stripe

- Confirm checkout creation does not update plan access.
- Confirm the checkout success page does not update plan access.
- Confirm only a signature-verified, idempotent Stripe webhook updates paid entitlement.
- Confirm DoroCoin purchase credit occurs only from the verified webhook.

## Locked Systems

- Confirm identity-document uploads are denied.
- Confirm payouts, withdrawals, automatic refunds, sponsor fund release, paid-entry prize pools, and DoroCoin-to-cash conversion remain unavailable.

There is no Firebase Rules unit-test harness in this repository yet. Add `@firebase/rules-unit-testing` and emulator-backed tests before broadening client Firestore access.
