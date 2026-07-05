# Phase 7.1 Admin Dashboard Polish

## Command Center

The protected `/admin` route remains inside the Challenge Suite application. The dedicated admin shell verifies access through `/api/admin/access`; all operational reads and mutations independently call the server-side admin authorization helper.

Overview queue cards are links with URL-based filters:

- Sponsor reviews: `/admin/sponsors?status=pending_review`
- Host verification: `/admin/hosts?status=pending_review`
- Challenge reviews: `/admin/challenges?status=pending_review`
- Submission moderation: pending and flagged filters
- Participant approvals: pending filter
- Winner confirmations: pending admin review filter
- Withdrawal reviews: pending review filter
- Disputes: open filter
- Revenue review: report type filter

The Action Required section is derived from current Firestore queue counts. It never displays seeded or invented metrics. Empty queues show `All queues are clear`.

System Safety uses operational wording rather than raw booleans. Automatic payouts, Sponsor release, prize-pool release, DoroCoin conversion, and KYC remain disabled or inactive. Withdrawals remain review-only and ad rewards require verified completion.

Audit events display administrator identity when available, action, target, relative time, reason, and before/after status.

## Header And Search

The admin header includes:

- global search
- View live site
- Refresh queues
- administrator identity
- Production environment badge

Search routes to `/admin/search?q=...` and groups current protected results across users, Sponsors, Hosts, challenges, submissions, and withdrawal references. This is a bounded live-data search foundation, not a full external search index.

## Navigation And Route Map

Navigation is grouped into Overview, Reviews, Platform, Operations, and Configuration.

Operational review routes:

- `/admin/sponsors`
- `/admin/hosts`
- `/admin/challenges`
- `/admin/submissions`
- `/admin/participants`
- `/admin/winners`
- `/admin/withdrawals`
- `/admin/disputes`

Platform routes:

- `/admin/users`
- `/admin/creators`
- `/admin/host-workspaces`
- `/admin/sponsor-brands`
- `/admin/events`
- `/admin/tournaments`
- `/admin/dorocoin`
- `/admin/cash-ledger`

Operations routes:

- `/admin/reports`
- `/admin/audit-logs`
- `/admin/notifications`
- `/admin/support`
- `/admin/announcements`

Configuration routes:

- `/admin/categories`
- `/admin/voting-rules`
- `/admin/revenue-rules`
- `/admin/feature-flags`
- `/admin/roles`
- `/admin/settings`

Every route resolves to real stored records when available or a premium foundation/empty state. No sidebar route returns a 404 or blank page.

## Queue And Detail Behavior

Sponsor, Host, challenge, submission, participant, winner, and withdrawal queues support status filters, record counts, responsive cards, details drawers, related-record links, and audited actions.

Sensitive actions use a shared confirmation dialog. Rejection, request changes, suspension, flags, disqualification, winner holds, withdrawal rejection, and information requests require a reason. Internal notes use the same protected dialog and are stored in `adminNotes`, not public documents.

Withdrawal approval remains blocked without genuine KYC. Processing and paid controls are intentionally absent until a provider or verified manual-payout proof flow exists.

## Complete Feature Map

Creator, Host workspace, Sponsor brand, event, tournament, DoroCoin, cash ledger, support, notifications, and announcement pages read their matching Firestore collections. Features requiring unimplemented delivery or execution are clearly labeled foundations.

Reports show current stored counts. Export controls are disabled and do not create fake files.

DoroCoin operations are read-only. DoroCoin-to-cash conversion and unreviewed grants are unavailable.

Cash ledger entries are read-only and append-only by server convention. No direct payout action exists.

Feature flags expose safety state only. Dangerous systems cannot be toggled on from the UI.

Admin roles list Owner, Admin, Reviewer, Finance Reviewer, Support, Moderator, and Read-only Auditor as a foundation. Self-promotion and Owner grants are not implemented.

## Security

- Admin APIs require verified Firebase authentication plus server-side admin authorization.
- Admin routes do not appear in public or account sidebars.
- `adminNotes`, `auditLogs`, withdrawal records, cash ledgers, DoroCoin ledgers, and financial collections remain unavailable through client Firestore rules.
- Normal users cannot write approval states or financial balances.
- Stripe webhook fulfillment, DoroCoin checkout fulfillment, and subscription lifecycle code are unchanged.

Phase 7 Firestore rules still require manual deployment if they have not already been deployed:

```powershell
firebase deploy --only firestore:rules,storage
```

## Known Gaps

- Search is a bounded in-memory grouping of protected API results, not a dedicated indexed search service.
- Support replies, assignments, announcement delivery, email/push notifications, exports, live streaming, and bracket execution remain foundations.
- Account suspension is not enabled until a complete session revocation and appeal workflow exists.
- KYC and payout-provider integrations are not connected.
- Mobile browser QA with real authenticated admin data remains required before production operations.

## QA Checklist

1. Confirm non-admin users receive Access Denied and admin APIs return 403.
2. Confirm every sidebar route resolves without a 404.
3. Confirm overview cards open the matching filtered queue.
4. Confirm Refresh queues reloads current Firestore data.
5. Confirm global search groups matching protected records.
6. Confirm reason-required actions cannot submit without a reason.
7. Confirm each saved action creates an audit event.
8. Confirm internal notes never appear on public challenge or submission documents.
9. Confirm Sponsor approval does not bypass subscription gating.
10. Confirm Host verification does not bypass Host subscription gating.
11. Confirm winner approval remains announcement-only.
12. Confirm withdrawal approval remains blocked without verified KYC.
13. Confirm no processing, paid, payout, release, refund, or KYC execution control exists.
14. Confirm reports and exports never create fake files.
15. Check 360px, 390px, 430px, 768px, 1024px, and desktop layouts with real admin records.
