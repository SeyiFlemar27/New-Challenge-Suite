# Phase 7.6D: Sponsor Contracts, Wallet, Billing, and Finance Foundation

## Scope

Phase 7.6D adds the sponsor legal and payment-operations foundation without activating real money movement. The work extends the Phase 7.6A-7.6C sponsor workspace with contracts, legal templates, wallet visibility, campaign funding readiness, milestones, billing, invoices, transaction history, server APIs, local Firestore protections, and sponsor navigation/dashboard entry points.

## Contract Center

Routes:

- `/sponsor/contracts`
- `/sponsor/contracts/[contractId]`
- `/sponsor/contracts/templates`

Contract statuses use stable machine-readable values:

- `draft`
- `sent_for_review`
- `changes_requested`
- `awaiting_signature`
- `partially_signed`
- `fully_signed`
- `active`
- `completed`
- `cancelled`
- `disputed`
- `archived`

The detail view shows linked proposal/campaign context, contract value foundation, deliverables summary, payment terms foundation, milestone schedule foundation, usage rights, confidentiality, dispute foundation, signature status, revision/audit foundation, and safe disabled actions.

No real electronic signature provider is active. No contract action creates funding, releases funds, launches campaigns, or creates legal finality.

## Legal Disclaimer UX

Contract surfaces include clear legal copy:

Challenge Suite does not provide legal advice. Contract templates and workflow tools are provided for operational convenience only. Sponsors and creators should consult qualified legal professionals before signing agreements.

Templates are presented as workflow aids only, not legal advice.

## Sponsor Wallet Foundation

Routes:

- `/sponsor/wallet`
- `/sponsor/wallet/fund-campaign`
- `/sponsor/campaigns/[campaignId]/funding`
- `/sponsor/wallet/transactions`

The sponsor wallet is separate from the user DoroCoin wallet. It shows foundation balances, reserved funds, pending transactions, campaign commitments, failed payments, refunds, and total spend when server records exist. Empty states are used when no records exist.

Campaign funding copy clarifies that sponsor subscriptions and campaign budgets are separate. The fund-campaign endpoint records a setup-required foundation event only. It does not charge a card, mark a campaign funded, reserve real money, or release money.

## Milestone Payment Foundation

Routes:

- `/sponsor/milestones`
- `/sponsor/campaigns/[campaignId]/milestones`

Milestone statuses use stable values:

- `draft`
- `scheduled`
- `awaiting_funding`
- `funded`
- `in_progress`
- `submitted`
- `under_review`
- `approved`
- `release_pending`
- `released_foundation`
- `disputed`
- `cancelled`

Milestone approval is foundation-only. Approval does not release real funds, update wallets, create creator income, or bypass funding/contract requirements.

## Billing, Invoices, and Receipts

Routes:

- `/sponsor/billing`
- `/sponsor/billing/invoices`
- `/sponsor/billing/invoices/[invoiceId]`

Invoice types:

- `subscription_invoice`
- `campaign_invoice`
- `funding_receipt`
- `milestone_receipt`
- `refund_receipt`
- `adjustment_note`

Invoice statuses:

- `draft`
- `issued`
- `paid`
- `payment_pending`
- `failed`
- `refunded`
- `cancelled`
- `void`

PDF download and paid status are foundation-only unless backed by provider/server records. Frontend pages cannot mutate subscription status or payment status.

## Navigation and Dashboard Integration

Sponsor navigation now exposes:

Legal:

- Contracts
- Templates

Finance:

- Wallet
- Billing
- Invoices
- Milestones
- Transactions

The sponsor dashboard action center and command cards now reference contract review, wallet readiness, invoices, billing, campaign funding, and milestone foundations without showing fake counts or fake financial status.

## Data Model and API Foundation

Shared helper:

- `lib/sponsor-finance.ts`

API routes:

- `GET /api/sponsor/contracts`
- `POST /api/sponsor/contracts`
- `GET /api/sponsor/contracts/[contractId]`
- `PATCH /api/sponsor/contracts/[contractId]`
- `GET /api/sponsor/contracts/templates`
- `GET /api/sponsor/wallet`
- `GET /api/sponsor/wallet/transactions`
- `POST /api/sponsor/wallet/fund-campaign-foundation`
- `GET /api/sponsor/milestones`
- `GET /api/sponsor/milestones/[milestoneId]`
- `PATCH /api/sponsor/milestones/[milestoneId]`
- `GET /api/sponsor/billing`
- `GET /api/sponsor/billing/invoices`
- `GET /api/sponsor/billing/invoices/[invoiceId]`

Collections added as local fail-closed rule entries:

- `sponsorContracts`
- `sponsorContractTemplates`
- `sponsorContractRevisions`
- `sponsorContractSignatures`
- `sponsorWallets`
- `sponsorWalletTransactions`
- `sponsorCampaignFunding`
- `sponsorMilestones`
- `sponsorInvoices`
- `sponsorReceipts`
- `sponsorBillingSettings`
- `sponsorPaymentMethods`
- `sponsorFinancialAuditLogs`

## Security Notes

Sponsor APIs require Firebase-authenticated sponsor context. Detail routes use sponsor ownership checks. Sensitive collections remain fail-closed in local Firestore rules. Sponsors cannot directly edit wallet balances, mark invoices paid, release funds, mark campaigns funded, mutate subscription status, issue refunds, or access another sponsor's finance/contract records.

Payment confirmation remains server/provider controlled. No frontend success page is trusted.

## Empty, Loading, and Error States

New pages include loading skeletons, clean empty states, API error cards, and disabled foundation actions with clear reasons. Financial pages avoid fake balances, fake paid invoices, fake signed contracts, fake refunds, and fake payment confirmations.

## Responsive Notes

The new pages use stacked cards, responsive grids, and mobile-safe list layouts. Tables were avoided where card layouts are clearer on mobile. Sponsor navigation remains drawer-based on mobile through the existing sponsor shell.

## Remaining P0 Blockers

- Provider-backed campaign funding is not configured.
- Real e-signature integration is not configured.
- Real payout/payment release workflows remain intentionally inactive.
- Invoice PDF generation is foundation-only.

## Remaining P1 Issues

- Admin finance review views should be added in a later phase.
- Contract template editing and version management should be expanded.
- Milestone creation from accepted contracts should be automated after contract/funding phases are ready.
- Billing portal and Stripe-backed sponsor subscription management should be wired through secure server flows.
- Transaction search/filtering can be expanded after real records exist.

## Recommended Next Phase

Proceed with controlled browser QA for sponsor contract, wallet, billing, invoice, and milestone routes, followed by admin finance review and provider-backed funding preparation only after explicit approval.
