# Phase 7.6A Sponsor Foundation, Plans, Onboarding, Dashboard, and Brand Profile

## Scope

Phase 7.6A builds the foundation of a professional Sponsor / Brand experience. It focuses on sponsor plans, account gates, onboarding, brand profile, dashboard command center, sponsor navigation, business verification foundations, settings, API/data model protection, and documentation.

This phase does not activate campaign funding, sponsor wallet movement, invoices, contracts, proposal negotiation, creator marketplace, challenge marketplace, analytics exports, team permissions, automatic sponsor release, prize release, payouts, withdrawals, refunds, or real-money Prediction Arena settlement.

## Sponsor Plan Structure

Sponsor plans were polished around three packages:

- Sponsor Starter: small businesses, startups, local brands, and first-time sponsors. Foundation includes sponsor dashboard, verified brand profile eligibility, up to 5 active sponsored challenges per month, basic campaign briefs, logo placement, one CTA, basic analytics foundation, brand asset uploads, one team member, and email support.
- Brand Partner: growing brands needing targeting, collaboration, and reporting foundations. Foundation includes up to 20 active sponsored challenges per month, advanced brief builder, creator filters, audience targeting, creator comparison, messaging/proposal foundations, campaign templates, advanced analytics, UTM/reporting foundations, five team members, and priority support.
- Enterprise Partner: enterprise brands and agencies. Foundation includes unlimited active campaigns, premium placements, tournament/event sponsorship, challenge naming rights, dedicated landing page foundations, custom KPI/API/webhook/CRM foundations, unlimited team members, audit/approval/SSO readiness, dedicated account manager, and custom onboarding.

Enterprise Partner uses Contact Sales, not direct checkout. Plan copy now clearly states that sponsor subscription payments unlock platform tools, while campaign sponsorship budgets, prize contributions, boosts, placements, and platform fees are separate.

## Onboarding Flow

`/sponsor/onboarding` is now a guided seven-step onboarding flow:

1. Business Information
2. Brand Identity
3. Sponsorship Goals
4. Target Audience
5. Budget Preferences
6. Business Verification
7. Completion Summary

The flow includes progress, save/resume foundation, upload-driven brand assets, business verification status copy, restricted-action messaging, and safe submit-for-review behavior.

Brand asset uploads use the existing `MediaUploadField` component. Raw URL fields are not the primary brand asset path.

## Dashboard Design

`/sponsor/dashboard` is now a Brand Command Center with:

- brand welcome header
- verification, plan, onboarding, and approval metrics
- Create Campaign, Browse Creators, and Browse Challenges CTAs
- approval/subscription/onboarding gate notice
- brand hero summary
- campaign performance foundation
- action center
- active campaigns empty state
- upcoming calendar foundation
- command center foundation cards

No fake analytics are displayed as real data. Empty states use “No data yet” or foundation copy.

## Navigation Structure

Sponsor navigation is grouped into:

- Command: Overview, Campaigns, Approvals, Deliverables
- Discover: Creators, Challenges, Events, Tournaments
- Brand: Brand Profile, Brand Assets, Proposals, Messages, Contracts
- Business: Wallet, Analytics, Reports, Team, Notifications, Settings, Sponsor Plans

Sponsor navigation remains separate from normal user rewards/challenge navigation.

## Brand Profile

Added `/sponsor/profile` and `/sponsor/profile/edit`.

The brand profile includes:

- hero/banner
- logo
- brand name
- industry
- verification badge/status foundation
- location
- website
- company description
- sponsorship goals
- target audience summary
- active campaign count foundation
- public/private visibility setting
- sponsor badge preview
- brand CTA preview

`/sponsor/profile/edit` reuses the onboarding editor foundation.

## Sponsor Settings

Added `/sponsor/settings` with sections for:

- brand profile
- business verification
- team foundation
- billing and subscription
- notifications
- security and privacy
- account deletion

Destructive actions are explicitly confirmation-gated foundations. No sponsor wallet release, refund, payout, prize release, or campaign money movement is available.

## Business Verification UX

Business verification foundation supports these status values:

- not_started
- in_progress
- submitted
- under_review
- additional_information_required
- verified
- rejected
- flagged

Sponsors can explore the dashboard while pending. Restricted actions remain blocked:

- funding campaigns
- verified badge
- high-value sponsorship tools
- payment release actions
- enterprise-level sponsorship tools

Sponsor-facing UI shows safe reasons and recovery paths without exposing raw provider/admin notes.

## Data Model and API Foundation

Added or extended server/API foundations for:

- `sponsorProfiles`
- `sponsorOnboarding`
- `sponsorBrandAssets`
- `sponsorVerification`
- `sponsorSettings`
- `sponsorActivity`
- `sponsorNotifications`
- `sponsorSubscriptions`
- `sponsorTeam`
- `sponsorAuditLogs`

Routes added or improved:

- `GET/POST/PATCH /api/sponsor/profile`
- `GET/POST/PATCH /api/sponsor/onboarding`
- `GET /api/sponsor/dashboard`
- `GET/PATCH /api/sponsor/settings`
- `GET /api/sponsor/activity`
- `GET /api/sponsor/notifications`
- `GET /api/admin/sponsors`
- `GET /api/admin/sponsors/[sponsorId]`
- `PATCH /api/admin/sponsors/[sponsorId]/verification`

Sponsor APIs require Firebase authentication, sponsor account type, ownership, request validation, and server-side writes. Admin sponsor verification routes require admin authentication.

## Security Notes

Firestore rules were updated to fail closed for the new sponsor foundation collections. Sponsors cannot verify themselves, edit verification status directly, access other sponsor data, edit subscription status, release campaign funds, or bypass plan limits from client writes.

Firestore and Storage rules were not published.

## Responsive Notes

Sponsor pages use stacked cards, grouped mobile navigation drawer, scrollable comparison tables, compact CTAs, and mobile-friendly form sections.

## Remaining P0 Blockers

- Credentialed sponsor QA is still required.
- Sponsor Stripe price IDs must be confirmed in Vercel before real checkout QA.
- Business verification provider/upload strategy must be finalized before collecting real documents.
- Firestore/Storage rules should not be broadly published until controlled QA confirms sponsor flows.

## Remaining P1 Issues

- Campaign marketplace and creator discovery need full implementation.
- Proposal negotiation, messaging, contracts, sponsor wallet, invoices, analytics exports, and reports remain later phases.
- Team permissions are foundation-only.
- Admin sponsor review UI can be expanded beyond API foundations.
- Brand asset library can be improved with versioning and approval workflow.

## Recommended Next Phase

Phase 7.6B should run credentialed sponsor QA and then build the first sponsor campaign brief foundation, including safe proposal/approval states without payment release behavior.