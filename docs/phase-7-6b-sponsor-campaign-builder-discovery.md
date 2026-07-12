# Phase 7.6B - Sponsor Campaign Builder, Creator Discovery, and Challenge Discovery

## Summary

Phase 7.6B adds the next sponsor workspace layer on top of the Phase 7.6A sponsor foundation. It introduces campaign brief drafting, sponsor-owned campaign records, creator discovery, challenge opportunity discovery, creator comparison, saved creators, saved challenges, and protected API/data model foundations.

This phase does not activate full proposals, messaging expansion, contracts, sponsor wallet funding, invoices, milestone payments, payouts, refunds, analytics exports, reports, or team permissions. No fake production metrics, creator earnings, proposal acceptance, or campaign funding were added.

## Campaign Builder Implementation

Routes added or improved:

- `/sponsor/campaigns`
- `/sponsor/campaigns/new`
- `/sponsor/campaigns/create`
- `/sponsor/campaigns/[campaignId]`
- `/sponsor/campaigns/[campaignId]/edit`

The builder uses an eight-step flow:

1. Campaign Basics
2. Audience
3. Creator Requirements
4. Campaign Deliverables
5. Budget
6. Payment Structure Foundation
7. Brand Requirements
8. Review and Save

Budget and payment structure are planning metadata only. Subscription payments remain separate from campaign sponsorship budgets. No sponsor money movement, campaign funding, milestone release, invoice execution, or refund behavior is active.

## Campaign Statuses

Campaign briefs use machine-readable statuses:

- `draft`
- `ready_for_review`
- `published`
- `inviting_creators`
- `proposal_open`
- `negotiating`
- `awaiting_contract`
- `awaiting_funding`
- `scheduled`
- `active`
- `paused`
- `completed`
- `cancelled`
- `archived`

Current UI actions save drafts and mark briefs ready for review. Marketplace publishing and proposal workflows remain foundation-only.

## Creator Discovery Foundation

Routes added:

- `/sponsor/discover/creators`
- `/sponsor/discover/creators/[creatorId]`
- `/sponsor/discover/creators/compare`

Creator discovery supports search, foundation filters, save creator, profile preview, comparison selection, and disabled invite-to-campaign foundation CTAs. Metrics that are not available are labeled as `Not available yet` or described as appearing after completed sponsor campaigns.

Creator profile preview exposes only public/sponsor-safe fields. It does not expose email, phone, KYC status, wallet data, internal notes, risk flags, or private profile data.

## Challenge Discovery Foundation

Routes added:

- `/sponsor/discover/challenges`
- `/sponsor/discover/challenges/[challengeId]`

Challenge discovery supports search, foundation filters, save challenge, sponsorship opportunity details, and disabled attach/proposal foundation CTAs. Estimated reach is labeled as foundation-only and not guaranteed.

Opportunity pages show challenge overview, creator summary, participant count, target audience foundation, brand placement examples, estimated reach foundation, sponsorship budget foundation, campaign timeline, deliverables foundation, and risk indicators. Funding and proposal sending remain inactive.

## Saved Creators And Challenges

Route added:

- `/sponsor/saved`

Saved item APIs support idempotent sponsor-owned saves/removes for creators and challenges. Saved creators and saved challenges are separated into tabs and link back to profile/opportunity pages.

## Data Model And API Foundation

Collections introduced or prepared:

- `sponsorCampaignBriefs`
- `sponsorCampaignDeliverables`
- `sponsorCampaignBudgets`
- `sponsorSavedCreators`
- `sponsorSavedChallenges`
- `sponsorCreatorComparisons`
- `sponsorDiscoveryPreferences`
- `sponsorshipOpportunities`
- `sponsorCampaignActivity`

API routes added:

- `GET /api/sponsor/campaigns`
- `POST /api/sponsor/campaigns`
- `GET /api/sponsor/campaigns/[campaignId]`
- `PATCH /api/sponsor/campaigns/[campaignId]`
- `GET /api/sponsor/discover/creators`
- `GET /api/sponsor/discover/creators/[creatorId]`
- `GET /api/sponsor/discover/creators/compare`
- `GET /api/sponsor/discover/challenges`
- `GET /api/sponsor/discover/challenges/[challengeId]`
- `GET /api/sponsor/saved`
- `POST /api/sponsor/saved/creators`
- `DELETE /api/sponsor/saved/creators/[creatorId]`
- `POST /api/sponsor/saved/challenges`
- `DELETE /api/sponsor/saved/challenges/[challengeId]`

Shared helpers added:

- `lib/sponsor-campaigns.ts`
- `lib/server/sponsor.ts`

## Security Notes

Sponsor APIs require Firebase authentication and sponsor account ownership. Campaign detail/update routes enforce ownership before reading or changing records. Saved creator/challenge APIs are scoped to the current sponsor and use idempotent document IDs.

Discovery APIs expose only public/sponsor-safe creator and challenge fields. They do not expose private profile data, private challenges, wallet data, KYC data, internal notes, risk flags, private submissions, or other sponsor data.

Firestore rules were updated locally to fail closed for the new sponsor campaign/discovery collections. Sensitive writes remain server/API-only. Firestore rules were not published.

Sponsors cannot:

- edit another sponsor's campaigns
- access another sponsor's saved creators or saved challenges
- see private creator data
- see private challenge data
- fund campaigns
- release payments
- bypass plan limits
- mark proposals accepted
- fake metrics
- edit subscription status

## Empty, Loading, And Error States

New pages include loading skeletons, empty states, error cards, disabled foundation actions, and clear copy for missing data. Empty states include:

- No campaign briefs yet.
- No creators found yet.
- No sponsorship-ready challenges yet.
- No saved creators yet.
- No saved challenges yet.

## Responsive Status

Pages use responsive grids, mobile-safe cards, stacked actions, and horizontal scrolling only where comparison data benefits from tabular layout. Campaign builder steps wrap into a mobile-safe grid.

## Remaining P0 Blockers

- Credentialed sponsor QA is still required against a controlled environment.
- Firestore rules must not be broadly published until controlled sponsor QA passes.
- Real creator opt-in and sponsor-visible profile rules need final product confirmation.
- Proposal, contract, funding, invoice, and sponsor wallet execution remain inactive and must be implemented in later phases before launch.

## Remaining P1 Issues

- Add richer creator opt-in controls and sponsor-safe metrics once real campaign history exists.
- Add campaign templates and duplication foundation.
- Add saved comparison persistence if URL-param comparison is not enough.
- Add admin sponsor campaign review screens.
- Add rate limiting and abuse monitoring around discovery/save APIs.
- Add richer challenge sponsorship package management for creators/hosts.

## Recommended Next Phase

Phase 7.6C should focus on sponsor proposal foundations, creator/challenge invitation workflows, admin review surfaces for campaign briefs, and controlled browser QA for sponsor campaign/discovery flows.
