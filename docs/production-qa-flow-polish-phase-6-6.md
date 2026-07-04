# Phase 6.6: Production QA and Flow Polish

## Role and Plan Matrix

| Effective state | Primary workspace | Primary upgrade | Restricted areas |
| --- | --- | --- | --- |
| Free Competitor | User Dashboard | Become a Creator | Creation, Host, Sponsor, revenue |
| Creator Starter | Creator Starter | Become a Host | Private, sponsor, prize pool, advanced analytics, Host |
| Creator Plan | Creator Studio | Become a Host in Host contexts | Host operations |
| Host Starter | Host Starter | Upgrade to Host | Paid Host operations |
| Host Plan | Host Control Center | Change Plan | Sponsor and Enterprise-only tools |
| Sponsor not submitted | Brand onboarding | Complete Brand Profile | Sponsor operations |
| Sponsor pending review | Brand review state | View Review Status | Sponsor operations |
| Sponsor approved, unpaid | Brand overview | Choose Sponsor Plan | Sponsor operations |
| Sponsor approved and paid | Brand Command Center | Change Sponsor Plan | Plan-specific team limits |
| Enterprise | Enterprise Command Center | Contact/plan management | Sponsor-only tools |

Payment warning states one and two retain the verified paid entitlement, matching the Stripe lifecycle policy. Later failed-payment states resolve to Free access.

## Fixes Applied

- Host participant, submission, and winner reads now query by the IDs of competitions owned by the Host. They no longer incorrectly query records where the Host is the participant or submitter.
- Creator Starter, paid Creator, Host, and Free badges use the centralized effective-tier label on profile and sidebar identity surfaces.
- Host navigation labels use concise route-matched names for Winners and Notifications.
- `/private` redirects to `/private-exclusive`; `/live` redirects to `/live-events`.
- Route matching remains most-specific-first for challenge creation, challenge detail, profiles, settings, My Entries, My Challenges, and all exact Host operation routes.

## Onboarding and Checkout Findings

- Account type selection persists intent without granting a paid plan.
- Creator and Host onboarding APIs require verified effective paid access.
- Completed Creator and Host onboarding routes to their correct dashboards.
- Sponsor onboarding supports draft, submit, review, resubmit, approved, and suspended states.
- Checkout success only polls verified profile state. It never activates a subscription or credits DoroCoins.
- Creator and Host purchases route to their respective onboarding pages after webhook confirmation.
- Incomplete confirmation provides retry and return-to-plans actions.

## Responsive QA

Core signed-out and gated routes were checked at mobile width with no document-level horizontal overflow. Shared shells use a drawer below the desktop breakpoint, touch-sized controls, wrapping action rows, and responsive grids. Host operation rows stack actions on smaller screens.

Authenticated visual verification still requires representative QA accounts for each role/state. Use the matrix below after deployment.

## Empty and Foundation States

Host operations provide loading, error, populated, and useful empty states. Moderation decisions, voting-state changes, winner publication, report exports, invoices, payouts, refunds, sponsor releases, and prize releases remain explicitly disabled where backend execution is not audited.

## Financial Safety

No payout, withdrawal, automatic refund, sponsor release, paid-entry prize release, jackpot execution, KYC, ad-reward fulfillment, DoroCoin-to-cash conversion, automatic winner payment, fake report download, or fake invoice download was enabled.

## Remaining Known Issues

- Full role-by-role visual QA needs signed-in test accounts representing each effective tier and sponsor review state.
- Host moderation, voting mutations, winner publication, and exports require dedicated authenticated APIs in later phases.
- Light theme coverage remains a foundation rather than a complete visual theme.

## QA Checklist

- Verify each role lands on the workspace in the matrix.
- Verify only one sidebar route is active.
- Verify Free Competitors cannot see creation or Host tools.
- Verify Creator Starter receives the basic creation form.
- Verify paid Creator receives the full Creator wizard.
- Verify paid Host receives the Host wizard and every `/host/*` workspace.
- Verify Sponsor tools require both approval and an active/trialing sponsor plan.
- Verify cancellation requires confirmation in Settings Billing.
- Verify Danger Zone requires `DELETE` and cannot execute deletion.
- Verify checkout success waits for webhook-backed status.
- Check 360, 390, 430, 768, and 1024 pixel widths with representative signed-in accounts.
