# Phase 7.4A: Privacy and Public Boundary Remediation

## Scope

This phase addresses the P0 and urgent P1 findings from the Phase 7.3 deep-root audit. It does not activate payouts, refunds, sponsor or prize releases, KYC processing, DoroCoin-to-cash conversion, fake exports, or automatic winner payments.

## P0 and P1 remediation

- Public challenge APIs now return only records that are both public and in an explicitly public lifecycle status.
- Private, exclusive, invite-only, draft, pending-review, rejected, suspended, hidden event, demo, and QA-seed challenges are excluded.
- Public responses use an explicit challenge field allowlist. Internal IDs, admin notes, risk fields, finance fields, access lists, and internal review data are not copied through.
- Submission detail requires either an approved public submission on a public challenge or ownership/management access.
- Public submission responses use an explicit allowlist and no longer return participant records, internal moderation data, or raw submission documents.
- Public feed and challenge leaderboards apply the same challenge/submission boundary.
- Global leaderboards exclude QA/demo, suspended, and explicitly non-public profiles.
- Backend health output no longer returns project, bucket, user, or provider identifiers.

## Firestore rules

Direct client reads and writes are denied for challenges, submissions, votes, leaderboards, winners, wallets, DoroCoin transactions, financial records, admin records, support tickets, Host workspaces, engagement records, and vote requests.

Public challenge, submission, leaderboard, and winner data must be delivered by server APIs that apply authorization checks and public field allowlists. Firebase Admin server calls bypass client rules and remain protected by API authentication/authorization.

Normal users cannot write approval states, audit logs, balances, ledgers, withdrawal states, or admin notes.

## Storage rules and configuration

Submission and challenge-media paths are fail-closed. Reads and writes remain disabled until:

1. The production Firebase Storage bucket is verified.
2. Upload moderation is connected.
3. Approved public media delivery uses a deliberate public or signed-URL path.
4. Private media delivery is authorization-aware.

Set `FIREBASE_STORAGE_BUCKET` and `NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET` in Vercel to the exact bucket name shown in Firebase Console under Storage. Do not guess between legacy `appspot.com` and newer `firebasestorage.app` names.

The entry UI reports a clear unavailable state rather than exposing raw Firebase errors. No entry is submitted after an upload failure.

## Public route boundary

Public:

- `/`
- `/landing`
- `/subscriptions`
- `/challenges`
- `/challenges/[public-id]`
- `/leaderboards`
- `/auth/*`
- `/privacy`
- `/terms`
- `/community-guidelines`
- `/refund-policy`
- `/cookie-policy`
- `/contact`
- `/about`

Protected routes still include dashboard, wallet, withdrawal, favorites, user challenge management, settings, Admin, Host operations, and Sponsor dashboard routes. Nested challenge actions such as create, join, vote, save, and management remain protected.

`/auth/sign-in` redirects to the canonical `/auth/login` route.

## Demo and QA handling

Public challenge, submission, feed, and leaderboard data excludes:

- IDs prefixed with `demo-`, `qa-`, or `qa_`
- `isQaSeed: true`
- `isDemo: true`
- `demo: true`
- `createdFor: "admin_qa"`

Landing-page illustrative content is labeled as a product/interface preview and does not claim live production activity.

## Free vote limit

Free votes are counted by `userId`, `challengeId`, `voteDate`, and `voteMode`. A user can use the plan allowance on different challenges while remaining limited on each individual challenge per day. DoroCoin voting remains separate and server-transactional. Ad rewards remain unverified and do not grant votes.

## Cancellation policy

The current policy is:

> Cancelling immediately returns the account to Free access after the verified Stripe webhook is received.

The cancellation API now cancels the Stripe subscription immediately rather than scheduling cancellation at period end. It does not update entitlement client-side. The verified Stripe deletion webhook remains the source of truth.

## Legal and SEO

Starter legal routes were added for Privacy, Terms, Community Guidelines, Refund Policy, Cookie Policy, Contact, and About. Each legal policy clearly requires qualified legal review before launch.

SEO essentials include root metadata, canonical base URL, Open Graph/Twitter metadata, generated brand icon, generated Open Graph image, `robots.txt`, `sitemap.xml`, and branded not-found/error pages.

## Manual deployment steps

Do not publish rules until code review and staging QA are complete.

1. Review `firestore.rules` and `storage.rules`.
2. Verify the app uses server APIs for every collection now denied to clients.
3. Confirm the exact production Storage bucket in Firebase Console.
4. Test with an anonymous user, a normal authenticated user, an owner/Host, a Sponsor, and an Admin.
5. In Firebase Console, publish the reviewed Firestore rules.
6. In Firebase Console, publish the reviewed Storage rules.
7. Re-run anonymous private challenge and submission probes against production.

## Remaining risks

- Corrected rules are code-review ready, but manual publication and production verification remain launch blockers.
- Storage is intentionally unavailable until the real bucket and media authorization design are verified.
- Starter legal text requires legal counsel review and confirmation of the support mailbox.
- Winner endpoints and public profile surfaces should receive a second dedicated data-minimization review before broad public launch.
- Immediate Stripe cancellation must be tested in Stripe test mode, including webhook delay and failure states.

## QA checklist

- [ ] Anonymous public challenge list excludes private, pending, demo, and QA records.
- [ ] Anonymous private challenge detail returns not found.
- [ ] Anonymous pending/private submission detail returns not found.
- [ ] Public submission response contains no participant email, user ID, notes, or risk fields.
- [ ] Public pricing loads without authentication.
- [ ] Protected routes show a sign-in gate.
- [ ] Free vote works once per challenge per day and on multiple different challenges.
- [ ] DoroCoin votes remain independent.
- [ ] Cancellation immediately cancels in Stripe test mode and access changes only through webhook.
- [ ] Storage bucket names match Firebase Console.
- [ ] Failed uploads show the safe unavailable message.
- [ ] Firestore and Storage rules pass emulator/manual tests before publication.
- [ ] Legal pages are reviewed by counsel.
- [ ] `robots.txt`, `sitemap.xml`, icon, Open Graph image, 404, and error pages render.
