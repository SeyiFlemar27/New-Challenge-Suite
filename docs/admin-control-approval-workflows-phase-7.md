# Phase 7 Admin Control And Approval Workflows

## Route Decision And Access

The operational admin command center lives inside the Challenge Suite application at `/admin`. It uses a dedicated layout and never appears in public, user, Creator, Host, or Sponsor navigation.

Admin authority is revalidated server-side for every admin API request. Accepted foundations are:

- Firebase custom claim `admin: true`
- server-owned `users.isAdmin`
- server-only `ADMIN_EMAIL_ALLOWLIST`

The client shell is only a presentation gate. It never replaces API authorization.

## Route Map

- `/admin` overview
- `/admin/sponsors`
- `/admin/hosts`
- `/admin/challenges`
- `/admin/submissions`
- `/admin/participants`
- `/admin/winners`
- `/admin/withdrawals`
- `/admin/reports`
- `/admin/users`
- `/admin/audit-logs`
- `/admin/settings`

## Approval Workflows

Sponsor review supports approve, reject, request changes, and suspend. Approval updates verification status only; paid Sponsor tools still require the existing active subscription gate.

Host review supports verify, reject, request changes, and suspend. Host Plan access still requires an active or trialing Host subscription.

Challenge moderation uses `draft`, `pending_review`, `published`, `flagged`, `rejected`, `archived`, and `suspended`. Submission moderation uses `pending_review`, `approved`, `rejected`, `flagged`, and `resubmission_requested`.

Participant oversight uses `pending`, `approved`, `rejected`, `checked_in`, `disqualified`, and `flagged`. Winner review uses `pending_host_confirmation`, `pending_admin_review`, `approved`, `held`, `published`, and `flagged`. Winner approval is announcement review only and does not release a prize.

Actions that reject, suspend, flag, disqualify, hold, or request changes require a reason and confirmation. Important actions append an `auditLogs` record containing the actor, target, previous status, new status, reason, note metadata, and timestamp.

Internal notes are stored in the server-owned `adminNotes` collection, not on public challenge or submission documents. This prevents public Firestore reads from exposing moderation notes.

## Real Data And Reports

The overview and queue pages read current Firestore records through the protected server API. Empty queues render intentional empty states. Reports show current record counts; export controls remain disabled and do not create fake files.

User oversight exposes account type, effective tier, subscription status, Sponsor status, Host status, creation date, and available activity timestamps to authorized administrators only. Account deletion is not available.

## Withdrawal Architecture

The balance model keeps DoroCoin and cash completely separate. DoroCoins are platform credits and cannot be withdrawn, converted, or transferred.

Cash wallets track:

- pending balance
- available balance
- under-review balance
- withdrawn history balance
- failed-withdrawal balance

`/wallet/withdraw` lets an authenticated non-Sponsor user submit a review request only when eligible available balance exists. Creation requires an idempotency key and atomically reserves the amount so it cannot be requested twice.

Only masked payout details are stored. The provider defaults to `manual`; `stripe_connect`, `paystack_transfers`, and `flutterwave_transfers` are namespaced foundations only. No provider credentials or calls exist.

Withdrawal statuses are `draft`, `pending_review`, `needs_kyc`, `approved`, `processing`, `paid`, `failed`, `rejected`, `cancelled`, and `reversed`. This phase only creates `pending_review`; admin review can request information or reject. Approval is blocked unless KYC is genuinely `verified`.

KYC statuses are foundation fields only. KYC processing is not integrated, so the UI clearly states that identity verification will be required later and never pretends verification succeeded.

Every withdrawal request creates an immutable `cashLedger` entry. Rejection creates a new reversal entry and atomically returns the reserved amount to available balance. No record is edited to simulate a payout.

## Firestore Security

`withdrawalRequests`, `cashLedger`, `payoutMethods`, Sponsor profiles, cash wallets, cash transactions, payout records, audit logs, and other financial collections deny direct client read/write access. Firebase Admin server routes own these operations.

Deploy updated rules manually after review:

```powershell
firebase deploy --only firestore:rules,storage
```

## Financial Safety

This phase does not activate automatic payouts, instant withdrawals, refunds, Sponsor money release, prize-pool release, jackpot execution, KYC processing, DoroCoin-to-cash conversion, provider transfers, fake paid statuses, or automatic winner payments. Stripe webhook, DoroCoin checkout fulfillment, and subscription lifecycle code are unchanged.

## QA Checklist

1. Confirm a non-admin receives Access Denied and a 403 from admin APIs.
2. Confirm authorized admins can open every admin route.
3. Confirm all queues use current Firestore data and empty states.
4. Confirm reason-required actions fail without a reason.
5. Confirm Sponsor approval does not bypass subscription access.
6. Confirm Host verification does not bypass Host subscription access.
7. Confirm winner approval does not pay or release prizes.
8. Confirm no report button downloads a fake file.
9. Confirm a zero available balance blocks withdrawal requests.
10. Confirm a valid request reserves balance exactly once.
11. Confirm repeating an idempotency key does not reserve twice.
12. Confirm rejection returns reserved balance and appends a reversal ledger entry.
13. Confirm approval is blocked while KYC is not verified.
14. Confirm full account numbers are never returned or displayed.
15. Deploy and emulator-test Firestore rules before production use.
