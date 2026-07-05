# Phase 7.2: Production Admin QA

## Scope

Phase 7.2 adds an admin-only QA checklist and a safe, batch-scoped Firestore seed workflow. It does not deploy rules, move money, approve KYC, call payout providers, send notifications, or change Stripe and DoroCoin fulfillment.

## Firestore Rules: Manual Publication

1. Open Firebase Console.
2. Select the `challenge-suite` project.
3. Open **Firestore Database**.
4. Open **Rules**.
5. Paste the complete local `firestore.rules` content.
6. Review the rules diff.
7. Select **Publish**.

To verify the latest rules:

1. Sign in with a normal account and confirm `/admin` shows Access Denied.
2. Confirm normal client code cannot read `auditLogs`, `adminNotes`, `withdrawalRequests`, `cashWallets`, or `cashLedger`.
3. Confirm normal client code cannot write approval statuses or DoroCoin balances.
4. Sign in with an authorized administrator and confirm `/api/admin/access` succeeds.
5. Confirm admin operations work only through server-authorized API routes.

Firebase CLI is optional. If CLI authentication is unavailable, use the Console steps above. A future authorized operator may use `firebase login` and `firebase deploy --only firestore:rules`, but Phase 7.2 does not run that command.

## Admin Access QA

The admin shell first requires an authenticated and email-verified Firebase user, then validates one of:

- Firebase custom claim `admin === true`
- `users/{uid}.isAdmin === true`
- the email appears in the server-only `ADMIN_EMAIL_ALLOWLIST`

The `/admin/settings/qa` checklist is browser-local and informational. It does not change Firebase or production settings.

## QA Seed Model

The protected `/api/admin/qa-data` endpoint requires the same server-side admin authorization as other admin APIs. Each seeded record includes:

- `isQaSeed: true`
- `qaSeedBatchId`
- `createdFor: "admin_qa"`
- `createdAt`
- `createdByAdminId`

A batch creates review records for Sponsor, Host, challenge, submission, participant, winner, withdrawal, and dispute queues. It also creates one append-only audit event.

The withdrawal test record remains `pending_review` with:

- KYC `not_started`
- payout provider `not_configured`
- transfers disabled
- payout execution false
- a clearly marked QA cash wallet and review-only ledger lock

No real user, provider, or payment record is created.

## Create and Cleanup

Open `/admin/qa-data`.

1. Select **Create QA seed records**.
2. Review the safety confirmation.
3. Confirm creation.
4. Open `/admin` and verify non-zero queue counts.
5. Exercise only the intended review actions.
6. Return to `/admin/qa-data`.
7. Select **Delete batch** and confirm.

Cleanup queries only the fixed QA collection allowlist and deletes only documents where both the batch ID matches and `isQaSeed === true`. It never deletes real user records. The cleanup audit event remains append-only.

## Queue Verification

Verify:

- Pending Sponsor reviews
- Pending Host verifications
- Pending challenge reviews
- Pending and flagged submissions
- Participant approvals
- Winner confirmations
- Open disputes
- Pending withdrawal reviews

Each dashboard card must open the corresponding filtered queue. The Action Required section should reflect seeded urgent records.

## Workflow Action Checklist

On QA records, verify:

- Sponsor: approve, request changes, reject, suspend
- Host: verify, request changes, reject, suspend
- Challenge: approve, reject, flag, archive, suspend
- Submission: approve, reject, request resubmission, flag
- Participant: approve, reject, disqualify, reinstate
- Winner: approve announcement, hold, request review, flag
- Withdrawal: request information or reject; approval remains blocked without verified KYC

Sensitive actions require confirmation. Rejections and other high-risk decisions require a reason. Every completed decision creates an append-only audit record.

## Audit Log Verification

Open `/admin/audit-logs` and confirm each action shows the administrator, action, target, previous status, new status, reason, and timestamp. Normal users must not read or write audit logs.

## Withdrawal QA

- `/wallet/withdraw` must reject requests without eligible available cash.
- DoroCoins remain separate and non-withdrawable.
- A legitimate request locks eligible cash in under-review balance.
- Admin review must not call a payout provider.
- Approval is blocked until genuine KYC readiness exists.
- A QA rejection may release the QA balance lock through a review-only ledger entry.
- No request can be marked paid by the QA seeder.

## Mobile QA

Check `/admin`, all review queues, `/admin/search`, `/admin/settings`, `/admin/settings/qa`, and `/admin/qa-data` at 360, 390, 430, 768, 1024 pixels and desktop. Verify the drawer, confirmation dialogs, cards, filters, and horizontally scrollable data remain usable without page overflow.

## Known Limitations

- Rules are not deployed automatically.
- QA records are not created automatically.
- Search uses the current admin operations data set rather than a dedicated search index.
- Push, email, exports, live streaming, KYC, and payout providers are not connected.
- Browser checklist state is local to the current browser.

## Safety Confirmation

Automatic payouts, instant withdrawals, refunds, Sponsor release, prize release, jackpot execution, KYC processing, DoroCoin-to-cash conversion, winner payments, fake downloads, fake notifications, unverified ad rewards, and fake live streaming remain inactive.
