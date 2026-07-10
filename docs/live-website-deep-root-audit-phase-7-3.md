# Phase 7.3: Live Website Deep-Root Audit

Audit date: 2026-07-05  
Production site: `https://www.challengesuite.com`  
Audited source commit: `ec592af Add admin QA checklist and seed data tools`

## Executive Summary

Challenge Suite has a coherent premium visual direction, a large route surface, strong server-side foundations for authentication, Stripe webhook fulfillment, DoroCoin ledgering, withdrawal review, and admin authorization. The public landing, registration, and verification pages are responsive and visually consistent.

The application is **not ready for a serious public launch**. The largest risks are data exposure, missing legal documents, broken production Storage configuration, inaccessible public discovery/pricing routes, production demo content presented as real activity, and paid-plan tools that remain mostly read-only or disabled foundations.

## Launch Readiness Score

**42 / 100**

Score rationale:

- Visual system and responsive public pages: strong
- Core route breadth: strong
- Authentication and server-side mutation patterns: generally sound
- Public conversion journey: broken by the global authentication gate
- Privacy boundary: launch-blocking gaps
- Media Storage: production health failure
- Legal/compliance: required pages absent
- Paid product delivery: substantial promised workflows remain foundations
- Authenticated role testing: not completed against production accounts

## Audit Scope and Evidence

### Level 1: Live Website UX

Direct browser checks covered:

- `/` and `/landing`
- `/subscriptions`
- `/challenges`
- `/leaderboards`
- `/auth/sign-in`
- `/auth/login`
- `/auth/register`
- `/auth/verify-email`
- legal/trust route candidates
- mobile widths 360, 390, 430, 768, and 1024 pixels

### Level 2: Route and Page Coverage

All files under `app/` were inventoried and grouped below. Sidebar destinations, dashboard links, aliases, dynamic routes, and foundation pages were inspected.

### Level 3: Codebase, API, Security, and Data Flow

Reviewed:

- all `app/api/**/route.ts` methods
- server authentication and admin authorization
- challenge visibility and public serialization
- Firestore and Storage rules
- voting and DoroCoin transactions
- wallet initialization and withdrawal locking
- Stripe checkout and webhook processing
- account bootstrap, onboarding, and walkthrough persistence
- Creator, Host, Sponsor, and Admin foundations

### Level 4: Production Launch Readiness

Production probes confirmed:

- Vercel is serving Phase 7.2 routes
- Firebase Admin initializes successfully
- Firestore server read/write succeeds
- Firebase Storage bucket lookup fails
- Stripe server and webhook secret are present
- unsigned webhook requests are rejected
- admin, QA seed, wallet, and withdrawal APIs reject anonymous requests
- Firestore rule publication cannot be confirmed remotely

## Critical Launch Blockers

### P0-1: Private Challenge and Submission Data Can Be Read Anonymously

Evidence:

- Anonymous `GET /api/challenges` returned a record with `visibility: "private"`.
- Anonymous `GET /api/challenges/demo-founder-pitch-sprint` returned private challenge title, description, rules, dates, participant count, and leaderboard metadata.
- `app/api/challenges/route.ts` returns the newest 100 challenges without filtering visibility or moderation status.
- `app/api/challenges/[id]/route.ts` checks access only when a user is authenticated. Anonymous callers bypass `canAccessChallenge`.
- `app/api/submissions/[id]/route.ts` returns the raw submission, raw challenge, participant record, and profile-derived data without authentication or visibility filtering.
- `firestore.rules` allows every challenge and submission document to be read publicly.
- `storage.rules` allows every submission and challenge-media object to be read publicly, regardless of challenge visibility or moderation state.

Required before launch:

1. Filter list APIs to public, approved/published lifecycle states.
2. Deny anonymous access to private, invite-only, pending-review, rejected, suspended, and draft records.
3. Apply access checks to anonymous single-challenge requests.
4. Replace raw submission responses with explicit public DTOs.
5. Protect private/pending media with authenticated access or signed URLs.
6. Update and deploy Firestore and Storage rules.
7. Add privacy regression tests for anonymous, participant, owner, Host, and Admin callers.

### P0-2: Firestore/Storage Rules Are Unverified and the Local Rules Are Not Launch-Safe

The production publication status of Phase 7 rules is unknown. This alone requires manual verification.

More importantly, the local rules currently permit:

- public reads of all `challenges`
- public reads of all `submissions`
- public reads of all user submission media
- public reads of all challenge media

Publishing the current rules would not resolve P0-1. The rules must first be redesigned around public-safe records or visibility-aware access.

### P0-3: Production Firebase Storage Configuration Is Failing

`GET /api/backend/health` returned HTTP 503. Firebase Admin and Firestore checks passed, but Storage reported that the configured bucket could not be found.

Impact:

- media uploads or reads that depend on Firebase Storage can fail
- challenge cover/promo workflows remain metadata/URL based
- submission upload reliability is not production-ready

Required:

- confirm the actual Firebase Storage bucket in Firebase Console
- correct `FIREBASE_STORAGE_BUCKET` and `NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET` in Vercel
- verify bucket exists and rules are published
- run authenticated upload/read/delete tests using non-sensitive QA media

### P0-4: Required Legal and Trust Documents Are Missing

Production returned HTTP 404 for:

- `/privacy`
- `/terms`
- `/community-guidelines`
- `/refund-policy`
- `/cookie-policy`
- `/contact`
- `/about`

Registration requires acceptance of Terms, Privacy Policy, and Community Guidelines, but the labels are not links to actual documents. The code contains short agreement summaries, not complete public policies.

This is especially serious because the product includes subscriptions, DoroCoin purchases, voting, prizes, sponsors, user-generated media, and withdrawal foundations.

Required:

- publish counsel-reviewed Terms, Privacy, Community Guidelines, Refund/Payments, Cookie, and prize/contest policies
- link each registration agreement to its exact version
- make legal documents accessible before sign-in
- record versioned consent server-side
- reconcile “non-refundable” copy with applicable consumer law and actual refund operations

### P0-5: Paid Plans Must Not Be Sold as Fully Operational Yet

The subscription architecture is safe, but several paid value propositions remain foundations:

- Creator Submissions, Analytics, Boosts, and Sponsor-Ready routes render empty foundation screens rather than operational data.
- Host Participant, Submission, Voting, Tournament, Report, and Winner screens load data, but their core action buttons are disabled.
- Host duplicate foundation routes under `/dashboard/host/[tool]` explicitly say actions are coming soon.
- Sponsor Campaigns, Create Campaign, Placements, Insights, Reports, Team, and related routes explicitly state that full workflows are planned.
- reports and invoices do not provide real exports/downloads.

Safe choices:

1. delay paid-plan public launch until the advertised core workflows work, or
2. narrow pricing copy and launch plans to an explicit early-access/foundation scope with no misleading promises.

## High-Priority Issues

### P1-1: Public Discovery and Pricing Are Blocked

The landing page links visitors to `/challenges`, `/leaderboards`, `/subscriptions`, and `/sponsor/plans`, but the global `VerificationGuard` permits only `/`, `/landing`, `/auth`, and `/mobile-preview`.

Production behavior:

- `/challenges` -> Sign in required
- `/leaderboards` -> Sign in required
- `/subscriptions` -> Sign in required
- `/sponsor/plans` -> Sign in required

This conflicts with “challenges are free to view” and weakens conversion. Public-safe challenge discovery, leaderboard previews, winners, pricing, brand plans, legal pages, robots, sitemap, and error pages need an explicit public route policy.

### P1-2: Production Demo Records Look Like Real Activity

Anonymous APIs return records such as:

- `demo-founder-pitch-sprint`
- `demo-street-dance-finals`
- `demo-neon-city-photo`
- demo users and leaderboard entries

Some show cash prizes, entry fees, thousands of votes, or active competition status. The landing page also hardcodes a “Live preview,” 246 participants, and a static leaderboard.

Required:

- remove production demo data, isolate it behind a labeled demo environment, or visibly mark it as demonstration content
- do not present simulated financial amounts or engagement as real
- power production landing previews from approved real data, with a credible empty state

### P1-3: Free Vote Enforcement Is Stricter Than the Product Rule

The required rule is one free vote **per challenge per day**.

`castVote` first counts all free votes by user and date, limited by `dailyFreeVoteLimit` (normally 1), then separately checks the challenge-specific vote. This means a Free user can currently be limited to one free vote total across the platform per day.

Required:

- remove or redesign the global daily query
- enforce the per-user, per-challenge, per-day unique constraint transactionally
- add concurrency and duplicate-request tests

### P1-4: Cancellation Behavior Conflicts With Product Copy

The current API sets `cancel_at_period_end: true` and says access downgrades after the verified webhook. Earlier product decisions state cancellation should immediately downgrade to Free.

Required:

- choose one policy with legal/product approval
- align Stripe operation, webhook lifecycle, Settings copy, Terms, and customer support behavior
- test cancellation and reactivation end to end

### P1-5: Pricing Copy Conflicts With Free Competitor Rules

This audit captured the old Free creation rule. Phase 7.4B updates the product decision to 3 lifetime Free Basic Challenges for non-premium users, with server-side enforcement and no private/paid/prize/sponsor/host tools.

Required:

- clarify Free Competitor versus Creator Starter on pricing and account-type screens
- avoid implying all Free users can create

### P1-6: SEO and Discoverability Foundations Are Missing

Missing or incomplete:

- `favicon.ico` (404)
- `robots.txt` (404)
- `sitemap.xml` (404)
- Open Graph image
- page-specific metadata
- canonical URLs
- public legal pages

Only root metadata is defined. The global auth guard also visually masks missing routes with a sign-in gate after hydration.

### P1-7: Public Health Endpoint Exposes Operational Configuration Details

`/api/backend/health` is public and reports project ID, bucket name/source, initialization, read/write state, and auth verification state. These are not secrets, but this is more production detail than a public health endpoint needs.

Recommended:

- return only a minimal healthy/degraded status publicly
- keep detailed diagnostics admin-only
- do not make absence of a caller token turn general health red

### P1-8: Admin Bootstrap Uses a Publicly Named Allowlist Variable

Initial admin assignment reads `NEXT_PUBLIC_INITIAL_ADMIN_EMAILS`. The server performs the assignment, and an attacker still needs control of a listed Firebase identity, but the variable naming encourages admin email exposure in client build configuration.

Required:

- use only server-side `ADMIN_EMAIL_ALLOWLIST` or Firebase custom claims
- remove the public admin-email configuration path
- audit existing admin assignments

### P1-9: Authenticated Role and Admin Workflows Need Real Production QA

No credentials were supplied for this audit, so these live states were code-audited but not exercised:

- Creator Starter
- paid Creator
- Host Starter
- paid Host
- each Sponsor review/payment combination
- authorized Admin
- wallet with and without balances
- withdrawal request lifecycle
- post-payment onboarding

Use dedicated non-production-money QA accounts before launch.

## Medium-Priority Issues

### P2-1: Route Naming Drift

- requested `/auth/sign-in` is a real 404; implementation uses `/auth/login`
- aliases exist for `/private` and `/live`, but canonical routes are `/private-exclusive` and `/live-events`
- invalid dynamic Sponsor features render an in-app “page not found” card instead of a true 404
- the global guard replaces many real 404 screens with “Sign in required”

### P2-2: Duplicate Host Foundation Surfaces

Operational Host pages exist under `/host/[tool]`, while older foundation pages remain under `/dashboard/host/[tool]`. Links such as `/dashboard/host/events` still target the older foundation route.

Consolidate on `/host/*` plus `/dashboard/host` as the command center.

### P2-3: Some Labels and Destinations Are Semantically Wrong

After challenge entry, “View My Submissions” links to `/my-challenges` instead of `/my-entries`.

### P2-4: Submission Detail Comments Are Disabled While Challenge Comments Exist

Challenge detail comments have an API-backed flow, but the submission detail page displays a disabled “Comments are not available yet” field. Decide whether comments belong at challenge or submission level and keep the model consistent.

### P2-5: Status Vocabulary Still Has Compatibility Drift

Examples:

- `canceled` and `cancelled`
- `trial` and `trialing`
- Sponsor `not_started`, `not_submitted`, `draft`, `submitted`, `pending_review`
- challenge `published`, `active`, `scheduled`, `submission_open`, and display-only “Open”
- submission `submitted`, `pending_approval`, `pending_review`, `active`, `winner`, `confirmed`

Normalization exists, but persisted fields and admin filters still span several vocabularies. Create migration rules and one canonical status per lifecycle axis.

### P2-6: Landing Performance Can Be Improved

The landing page relies on large remote Unsplash CSS background images and hardcoded previews. These bypass Next image optimization and may hurt LCP on slower networks.

### P2-7: Public Navigation Footer Is Incomplete

The footer includes Sign In, Create Account, and For Brands only. Add legal, safety, contact, accessibility, and company links after those pages exist.

### P2-8: `/mobile-preview` Is Public

This appears to be a demo/prototyping surface. Hide it from production or clearly identify its purpose.

## P3 Polish Items

- Add page-specific titles and descriptions.
- Add real loading telemetry and Core Web Vitals monitoring.
- Add branded error, maintenance, and offline states.
- Replace remaining generic “foundation” paragraphs with concise scope-aware copy.
- Improve static landing challenge and leaderboard previews once real approved data exists.
- Add reusable legal/footer navigation across public pages.
- Add a deliberate reset path for the product walkthrough in Settings.

## Route Inventory

### Public and Auth

| Route | Intended access | Exists | Live result | Completeness |
|---|---|---:|---|---|
| `/` | public | yes | redirects to `/landing` | working |
| `/landing` | public | yes | premium, responsive | visually strong; static/demo content |
| `/challenges` | public discovery | yes | sign-in gate | P1 access mismatch |
| `/challenges/[id]` | public if approved/public | yes | sign-in gate; API public | UI blocked; API overexposes |
| `/leaderboards` | public | yes | sign-in gate | P1 access mismatch |
| `/winners` | public | yes | sign-in gate | access mismatch |
| `/brands/[brandSlug]/*` | public brand profile | yes | sign-in gate | access mismatch |
| `/subscriptions` | public plan comparison | yes | sign-in gate | P1 conversion gap |
| `/sponsor/plans` | public brand plans | yes | sign-in gate | P1 conversion gap |
| `/auth/login` | public | yes | working UI | not transaction-tested |
| `/auth/sign-in` | public alias | no | 404 | add redirect or update references |
| `/auth/register` | public | yes | working UI | legal links missing |
| `/auth/verify-email` | public | yes | polished UI | email delivery not tested |
| `/auth/forgot-password` | public | yes | exists | delivery not tested |
| `/checkout/success` | post-checkout | yes | protected by global guard | webhook-only logic retained |
| `/checkout/cancel` | post-checkout | yes | protected by global guard | working foundation |

### Competitor and Social

| Route group | Access | State |
|---|---|---|
| `/dashboard` | verified user | tier-aware dashboard; live role states untested |
| `/feed` | verified user | API filters public challenge/submission states correctly |
| `/favorites` | verified user | saved/watch-later/interested persistence implemented |
| `/wallet` | verified user | zero-balance initialization implemented |
| `/wallet/withdraw` | verified user with eligible cash | review-only request flow |
| `/my-entries` | verified user | exists |
| `/my-challenges` | Creator/Host intent | exists with Competitor upgrade state |
| `/profile`, `/profile/edit` | verified user | exists |
| `/profile/[username]/*` | intended public profile | global guard makes UI private |
| `/submissions/[id]` | approved public submission or authorized user | exists; API disclosure needs remediation |
| `/challenges/[id]/join` | verified eligible user | exists |
| `/challenges/[id]/votes` | verified user | transactional voting |
| `/challenges/[id]/watch` | verified user | useful watch-room foundation |
| `/challenges/[id]/boost` | eligible Creator/Host | gated |
| `/challenges/[id]/sponsor` | approved Sponsor | gated |

### Creator

| Route | State |
|---|---|
| `/onboarding/creator` | full-screen, paid-plan gate, persistence implemented |
| `/challenges/create` | tier-aware basic/Creator/Host builders |
| `/creator/submissions` | foundation-only empty state |
| `/creator/analytics` | foundation-only empty state |
| `/creator/boosts` | routes to challenge selection; limited operational depth |
| `/creator/sponsor-ready` | foundation-only empty state |

### Host

| Route | State |
|---|---|
| `/dashboard/host` | command-center dashboard |
| `/onboarding/host` | full-screen paid-plan setup |
| `/host/participants` | data view; moderation action disabled |
| `/host/submissions` | data view; review action disabled |
| `/host/voting` | summary view; state controls unavailable |
| `/host/tournaments` | draft planning/foundation |
| `/host/reports` | view foundation; export disabled |
| `/host/winners` | review view; confirmation disabled |
| `/host/notifications` | in-app data foundation |
| `/host/team` | invitation foundation |
| `/live-events` | tier-aware discovery/management view |
| `/private-exclusive` | tier-aware private management |
| `/dashboard/host/[tool]` | duplicate older foundation routes |

### Sponsor

| Route | State |
|---|---|
| `/sponsor/onboarding` | save/submit and review-state flow |
| `/sponsor/dashboard` | state-aware overview |
| `/sponsor/plans` | plan cards; public link is auth-gated |
| `/sponsor/messages` | message foundation |
| `/sponsor/campaigns` | gated foundation |
| `/sponsor/challenges` | gated foundation |
| `/sponsor/create-campaign` | placeholder |
| `/sponsor/placements` | foundation |
| `/sponsor/insights` | foundation |
| `/sponsor/reports` | foundation |
| `/sponsor/billing` | separated subscription/budget foundation |
| `/sponsor/team` | plan-gated foundation |
| `/sponsor/settings` | links to general Settings |

### Admin

All required routes resolve through `/admin/[section]` or explicit pages:

- `/admin`
- `/admin/sponsors`
- `/admin/hosts`
- `/admin/challenges`
- `/admin/submissions`
- `/admin/participants`
- `/admin/winners`
- `/admin/withdrawals`
- `/admin/disputes`
- `/admin/users`
- `/admin/creators`
- `/admin/host-workspaces`
- `/admin/sponsor-brands`
- `/admin/events`
- `/admin/tournaments`
- `/admin/dorocoin`
- `/admin/cash-ledger`
- `/admin/reports`
- `/admin/audit-logs`
- `/admin/notifications`
- `/admin/support`
- `/admin/announcements`
- `/admin/categories`
- `/admin/voting-rules`
- `/admin/revenue-rules`
- `/admin/feature-flags`
- `/admin/roles`
- `/admin/settings`
- `/admin/search`
- `/admin/settings/qa`
- `/admin/qa-data`

Anonymous calls to `/api/admin/access` and `/api/admin/qa-data` returned 401. Authorized production Admin UI and mutations were not tested.

### Settings and Onboarding

| Group | State |
|---|---|
| `/settings` and `/settings/[section]` | account, profile, appearance, notifications, privacy, security, billing, wallet, preferences, danger |
| `/settings/customization` | legacy/customization surface; potential orphan |
| `/onboarding/account-type` | persists intent once |
| `/onboarding/creator` | paid Creator only |
| `/onboarding/host` | paid Host only |
| Product walkthrough | server-persisted completion; shown only when explicitly incomplete |

### Legal and Trust

None of the requested legal/trust routes exist. All returned 404 at the HTTP level.

### API Route Audit

#### Strong patterns

- Admin APIs use `requireAdminUser`.
- User mutations generally use `requireRequestUser`.
- Challenge creation, submissions, voting, withdrawal, and admin operations validate input.
- Voting and withdrawal balance changes use Firestore transactions.
- Stripe webhook verifies signatures and deduplicates events.
- DoroCoin credits are applied only from the verified webhook.
- Withdrawal requests require idempotency and lock eligible cash.
- Withdrawal approval is blocked without verified KYC.
- Sensitive admin actions create audit events.

#### Gaps

- public challenge list has no visibility/moderation filter
- anonymous single-challenge access bypasses challenge access checks
- public submission detail returns raw related data
- Firestore/Storage public-read rules are too broad
- some public GET routes lack explicit public DTOs
- Creator/Host/Sponsor APIs and UIs do not yet cover advertised operational mutations
- detailed health diagnostics are public

## Role Permission Matrix

| Role/state | Dashboard/sidebar | Participation | Creation/tools | Audit result |
|---|---|---|---|---|
| Free Competitor | code matches intended compact sidebar | join/vote/save/watch supported | create blocked server-side | mostly complete; free-vote bug |
| Creator Starter | starter labels/sidebar implemented | retained | one basic public non-monetized challenge enforced | code-complete; live state untested |
| Paid Creator | Creator identity/sidebar implemented | retained | full builder; tool pages mostly foundations | incomplete paid value |
| Host Starter | starter sidebar/gates | retained | limited create intent | live state untested |
| Paid Host | Host command sidebar, no duplicates | My Entries retained | operations visible, mutations disabled | incomplete paid value |
| Sponsor not submitted/pending | state-aware gates | normal voting blocked | onboarding/settings/plans | coherent foundation |
| Sponsor approved unpaid | plan prompt | normal voting blocked | full tools locked | coherent |
| Sponsor approved paid | Brand Command Center | separate Sponsor model | most tools remain foundations | incomplete paid value |
| Admin | separate shell | not relevant | server-authorized operations | anonymous denial confirmed; authorized live QA pending |

## End-to-End Flow Status

| Flow | Status | Notes |
|---|---|---|
| Visitor -> Register -> Verify -> Account Type -> Dashboard | partially complete | code path coherent; email delivery and full live flow untested |
| Free Competitor -> Save/Watch/Interested/Watch Room/Vote | partially complete | persistence implemented; public discovery blocked; free vote rule incorrect |
| Free Competitor -> Create Challenge gate | complete in code | server rejects Competitor creation |
| Creator Starter -> Basic Challenge | complete in code | monthly/basic/non-monetized enforcement present |
| Paid Creator -> Checkout -> Onboarding -> Studio | partially complete | webhook-safe; paid tools mostly foundations |
| Paid Host -> Checkout -> Onboarding -> Control Center | partially complete | onboarding/dashboard present; operations mostly read-only |
| Sponsor -> Review -> Subscription -> Command Center | partially complete | gates correct; campaign tools incomplete |
| Admin -> Reviews -> Audit Log | partially complete | implementation exists; authorized production test pending |
| Winner -> Eligible Cash -> Withdrawal -> Admin Review | safe foundation | no payout; requires genuine KYC before approval |

## Payment, Wallet, and Withdrawal Audit

### Stripe

Confirmed:

- Stripe server configuration and webhook secret are present because an unsigned webhook request reached signature validation and returned 400.
- webhook endpoint is `/api/stripe/webhook`
- handled events include checkout completion, invoice success/failure, and subscription update/deletion
- webhook event persistence is idempotent
- checkout success does not activate subscriptions or credits
- Pro checkout is blocked for new purchases

Needs manual verification:

- webhook is registered in the correct Stripe account/mode
- Creator, Host, Enterprise, and Sponsor Price IDs
- DoroCoin Price IDs
- `NEXT_PUBLIC_APP_URL`
- real test-mode checkout for every visible plan

### DoroCoin

Confirmed:

- public package catalog is available
- wallet initializes to zero
- DoroCoins are non-withdrawable/non-cash
- spending and vote recording occur transactionally
- request idempotency is supported
- insufficient balance is rejected

Gap:

- free-vote limit is currently global-per-day as well as per-challenge-per-day

### Withdrawals

Confirmed:

- authenticated only
- real cash balances are separate from DoroCoins
- available cash is locked transactionally
- requests require idempotency
- Sponsor accounts are blocked
- no payout provider is called
- Admin approval requires verified KYC
- no automatic paid state exists

## Admin Audit

Working from code and anonymous production probes:

- separate Admin shell
- no Admin navigation in normal sidebars
- server-side Admin authorization
- anonymous Admin APIs return 401
- queue links and Action Required destinations exist
- confirmation/reason modal exists
- audit logs are append-only by client rules
- QA seed records are tagged and batch-cleaned
- withdrawal approval is KYC-blocked

Not verified:

- authorized Admin account access
- live queue data/actions
- QA seed create/delete in production
- actual Firestore rules publication

## Mobile and Visual Audit

### Confirmed

No horizontal overflow was detected on `/landing`, `/auth/register`, or `/auth/verify-email` at:

- 360px
- 390px
- 430px
- 768px
- 1024px

The landing, registration, and verification pages share the premium black/gold system and have clear mobile layouts.

### Not Fully Verified

Authenticated dashboards, Host, Sponsor, Admin, tables, and action dialogs were not live-tested because no role-specific QA sessions were supplied. Source inspection shows drawers, scroll containers, responsive cards, and mobile navigation, but this is not a substitute for authenticated device QA.

## Security Findings

### Positive

- `.env` files are not part of this change or audit output.
- secrets were not printed.
- Stripe secret use is server-only.
- webhook signature verification is server-only.
- DoroCoin fulfillment is webhook-only.
- Admin APIs fail closed.
- direct client writes to financial/admin collections are denied in local rules.
- payouts, releases, KYC, and cash conversion remain inactive.

### Must Fix

- private challenge/submission/media exposure
- unsafe broad public Firestore/Storage reads
- unverified deployed rules
- public admin-email configuration path
- public detailed health diagnostics

## Environment Readiness Checklist

| Item | Status |
|---|---|
| Vercel production deployment | configured; Phase 7.2 API route is live |
| Firebase client environment | configured |
| Firebase Admin environment | configured |
| Firestore server connectivity | working |
| Firebase Storage | failing bucket lookup |
| Firestore rules published | unknown; manual verification required |
| Storage rules published | unknown; manual verification required |
| Stripe secret key | configured |
| Stripe webhook secret | configured |
| Stripe webhook registration/events | needs manual verification |
| Stripe Price IDs | unknown |
| DoroCoin Price IDs | unknown |
| `NEXT_PUBLIC_APP_URL` | unknown |
| Resend/email provider | unknown; delivery test required |
| Admin allowlist/custom claims | unknown; authorized test required |
| Open Graph/favicon/robots/sitemap | missing/incomplete |

## Recommended Next Phases

### Phase 7.4A: Privacy and Public Route Boundary

1. Fix challenge/submission API visibility.
2. Replace raw public DTOs.
3. Redesign Firestore and Storage rules.
4. Add privacy/access regression tests.
5. Publish rules manually and verify.

### Phase 7.4B: Legal, Storage, and Public Conversion

1. Fix Firebase Storage bucket and upload tests.
2. Publish legal/trust pages.
3. Make approved discovery, leaderboards, winners, pricing, brand plans, and public profiles public.
4. add favicon, robots, sitemap, OG, and page metadata.
5. remove or clearly label demo data.

### Phase 7.5: Paid Product Scope Decision

Either implement Creator/Host/Sponsor core mutations or narrow/disable paid checkout until the promised features are operational.

### Phase 7.6: Authenticated Production QA

Run a controlled matrix using dedicated QA accounts for every effective tier, Sponsor state, and Admin role. Use Stripe test mode only and do not execute money movement.

## Launch Decision

**No-go for serious public launch.**

The site is appropriate for controlled internal QA after the privacy boundary is fixed. It should not accept broad public traffic or market paid plans as complete until P0 items are resolved.
