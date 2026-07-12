# Phase 7.6C: Sponsor Proposals, Messaging, Deliverables, and Approvals

## Summary

Phase 7.6C connects the sponsor foundation from Phases 7.6A and 7.6B into collaboration workflows. Sponsors can now prepare proposal drafts, send proposal foundations, review proposal timelines, message creators in business-context threads, keep internal notes separate, track deliverables, and manage approval queues.

No contracts, campaign funding, invoices, milestone releases, refunds, payouts, sponsor wallet movement, or automatic campaign launch behavior were activated.

## Proposal Center

Routes:

- `/sponsor/proposals`
- `/sponsor/proposals/new`
- `/sponsor/proposals/[proposalId]`

Statuses use machine-readable values:

- `draft`
- `sent`
- `received`
- `under_review`
- `negotiating`
- `changes_requested`
- `accepted`
- `declined`
- `expired`
- `withdrawn`
- `converted_to_campaign`
- `archived`

Proposal cards show title, status, linked campaign, linked creator or challenge, proposed budget foundation, dates, deliverable count, pending action, and a details CTA. Empty states explain that sponsors can start from a campaign brief, creator discovery, or challenge discovery.

## Proposal Detail and Timeline

The proposal detail page includes:

- Proposal title and status
- Linked campaign, creator, and challenge context
- Proposed budget and dates
- Deliverables
- Payment preference foundation
- Brand requirements
- Revision timeline
- Activity timeline
- Internal sponsor notes
- Creator-visible message link

Available actions include send, request changes, counteroffer, accept foundation, decline, withdraw, and archive. Acceptance is explicitly foundation-only and does not create a contract, fund a campaign, release payments, or launch a campaign.

## Proposal Create/Send Foundation

`/sponsor/proposals/new` supports prefilled query parameters:

- `campaignId`
- `creatorId`
- `challengeId`

The form captures proposal title, campaign/creator/challenge references, objective, budget, dates, deliverables, payment preference foundation, brand requirements, and notes to creator.

Saving or sending creates proposal, revision, and activity records. It does not create contracts, move money, mark campaigns funded, or release payments.

## Messaging Foundation

Routes:

- `/sponsor/messages`
- `/sponsor/messages/[conversationId]`

Messaging is structured as a business collaboration workspace. Conversations can be linked to proposals, campaigns, or challenges. Message records are creator-visible, while internal notes are intentionally stored separately.

Message delivery and read states are foundation labels only:

- `sent`
- `delivered_foundation`
- `read_foundation`

No email delivery provider or real-time messaging system was activated.

## Internal Notes Separation

Internal notes are handled by `/api/sponsor/internal-notes` and use:

- `visibility: internal_only`
- `creatorVisible: false`

The UI warns: Internal note - visible only to your sponsor team.

Creators and participants must never see internal notes. Notes are tied to sponsor ownership and related entities such as proposals, campaigns, creators, challenges, deliverables, or approval items.

## Deliverables Workspace

Routes:

- `/sponsor/deliverables`
- `/sponsor/deliverables/[deliverableId]`
- `/sponsor/campaigns/[campaignId]/deliverables`

Statuses use machine-readable values:

- `not_started`
- `in_progress`
- `submitted`
- `under_review`
- `changes_requested`
- `approved`
- `overdue`
- `cancelled`

Deliverables track title, campaign/proposal/creator context, due date, submitted file metadata foundation, revision number, sponsor feedback, approval history, and next action. Approving a deliverable records creative approval only and does not release sponsor money.

## Approval Center

Routes:

- `/sponsor/approvals`
- `/sponsor/approvals/[approvalId]`

Statuses use machine-readable values:

- `pending`
- `under_review`
- `approved`
- `changes_requested`
- `rejected`
- `overdue`
- `cancelled`

Approval items can represent campaign titles, challenge rules, promotional flyers, videos, banners, social posts, sponsor placements, winner announcements, and final report foundations. Approving an item updates status and writes activity only. It does not release money, publish a campaign, sign a contract, or finalize a milestone.

## Dashboard and Navigation

Sponsor navigation already includes:

- Proposals
- Messages
- Deliverables
- Approvals

The dashboard action copy now points sponsors toward proposal, message, deliverable, and approval workspaces while keeping funding and release actions clearly foundation-only.

## API and Data Model Foundation

New or updated APIs:

- `GET /api/sponsor/proposals`
- `POST /api/sponsor/proposals`
- `GET /api/sponsor/proposals/[proposalId]`
- `PATCH /api/sponsor/proposals/[proposalId]`
- `POST /api/sponsor/proposals/[proposalId]/revisions`
- `GET /api/sponsor/proposals/[proposalId]/activity`
- `GET /api/sponsor/messages`
- `POST /api/sponsor/messages`
- `GET /api/sponsor/messages/[conversationId]`
- `POST /api/sponsor/messages/[conversationId]`
- `GET /api/sponsor/internal-notes`
- `POST /api/sponsor/internal-notes`
- `GET /api/sponsor/deliverables`
- `POST /api/sponsor/deliverables`
- `GET /api/sponsor/deliverables/[deliverableId]`
- `PATCH /api/sponsor/deliverables/[deliverableId]`
- `GET /api/sponsor/approvals`
- `POST /api/sponsor/approvals`
- `GET /api/sponsor/approvals/[approvalId]`
- `PATCH /api/sponsor/approvals/[approvalId]`

Collections/foundations:

- `sponsorProposals`
- `sponsorProposalRevisions`
- `sponsorProposalActivity`
- `sponsorConversations`
- `sponsorMessages`
- `sponsorInternalNotes`
- `sponsorDeliverables`
- `sponsorDeliverableRevisions`
- `sponsorApprovals`
- `sponsorApprovalComments`
- `sponsorApprovalActivity`

## Security Notes

Sponsor APIs validate Firebase authentication and sponsor account access through server-side helpers. Resource reads and writes are owner-scoped by `sponsorId`, `ownerUid`, or `createdBy`. Internal notes are stored separately from creator-visible messages.

Firestore rules were updated locally to keep the new sponsor collaboration collections fail-closed. Rules were not published.

Sponsors cannot use these workflows to:

- Access another sponsor's proposals, messages, notes, deliverables, or approvals
- Expose internal notes to creators
- Release campaign funds
- Create contracts automatically
- Fund campaigns
- Fake metrics
- Edit subscription status
- Trigger refunds, payouts, withdrawals, sponsor release, or prize release

## Empty, Loading, and Error States

New pages include loading cards, clean empty states, error/notice copy, and disabled foundation actions with clear reasons.

Examples:

- No proposals yet.
- No messages yet.
- No deliverables yet.
- No approvals pending.

## Responsive Status

The proposal center, proposal detail timeline, messaging workspace, deliverable cards, and approval queue use stacked cards and responsive grids. Complex workflows avoid dense desktop-only tables.

## Remaining P0 Blockers

- Production credentialed sponsor QA is still required.
- Firestore rules must be reviewed and deployed through an approved release process before relying on production client access behavior.
- Real contract, funding, invoice, and payment-release systems are intentionally not active.

## Remaining P1 Issues

- Real-time messaging is not implemented; current messaging is refresh/fetch foundation.
- Creator-side proposal response UI is not implemented yet.
- File attachment upload/review is metadata foundation only.
- Team permissions are not deeply implemented.
- Notifications are activity/foundation only unless a configured notification provider is added later.

## Recommended Next Phase

Phase 7.6D should build sponsor contracts, campaign funding foundation, invoice/milestone planning, and stronger creator-side proposal response workflows while preserving money-movement safety gates.
