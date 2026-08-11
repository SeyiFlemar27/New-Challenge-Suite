import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();
const read = (file) => readFileSync(join(root, file), "utf8");
const exists = (file) => existsSync(join(root, file));

const helper = read("lib/server/prize-approvals.ts");
const settlement = read("lib/server/challenge-settlement.ts");
const payout = read("lib/server/payout-structure.ts");
const wallet = read("lib/server/wallet-architecture.ts");
const proposalRoute = read("app/api/challenges/[id]/winner-proposals/route.ts");
const adminQueueRoute = read("app/api/admin/prize-approvals/route.ts");
const adminListRoute = read("app/api/admin/challenges/[id]/winner-proposals/route.ts");
const previewRoute = read("app/api/admin/challenges/[id]/winner-proposals/[proposalId]/preview/route.ts");
const approveRoute = read("app/api/admin/challenges/[id]/winner-proposals/[proposalId]/approve/route.ts");
const rejectRoute = read("app/api/admin/challenges/[id]/winner-proposals/[proposalId]/reject/route.ts");
const changesRoute = read("app/api/admin/challenges/[id]/winner-proposals/[proposalId]/request-changes/route.ts");
const adminPage = read("app/admin/prize-approvals/page.tsx");
const adminShell = read("components/admin/admin-shell.tsx");
const stripeWebhook = read("app/api/stripe/webhook/route.ts");

assert(exists("lib/server/prize-approvals.ts"), "prize approval helper must exist.");
assert(exists("app/api/challenges/[id]/winner-proposals/route.ts"), "winner proposal route must exist.");
assert(exists("app/api/admin/prize-approvals/route.ts"), "admin prize approval queue route must exist.");
assert(exists("app/admin/prize-approvals/page.tsx"), "admin prize approval UI foundation must exist.");

assert(helper.includes("WINNER_PROPOSAL_STATUSES"), "proposal statuses must be centralized.");
assert(helper.includes("\"draft\"") && helper.includes("\"pending_admin_review\"") && helper.includes("\"approved\"") && helper.includes("\"changes_requested\""), "proposal lifecycle statuses must include draft, pending review, approved, and changes requested.");
assert(helper.includes("defaultWinnerSplit"), "winner split defaults must exist.");
assert(helper.includes("DEFAULT_WINNER_SPLITS.single") && helper.includes("DEFAULT_WINNER_SPLITS.topThree"), "single and top-three default splits must be reused.");
assert(payout.includes("topThree") && payout.includes("percent: 50") && payout.includes("percent: 30") && payout.includes("percent: 20"), "default top-three split must be 50/30/20.");
assert(helper.includes("totalPercent !== 100"), "split validation must require 100%.");
assert(helper.includes("Duplicate winner placements are not allowed."), "duplicate placements must be blocked.");
assert(helper.includes("Duplicate winner users are not allowed."), "duplicate winners must be blocked.");
assert(helper.includes("Winner split cannot be negative."), "negative split must be blocked.");

assert(proposalRoute.includes("requireRequestUser"), "winner proposal route must require authenticated verified user.");
assert(proposalRoute.includes("canProposeChallengeWinners"), "winner proposal route must authorize owner/operator/admin.");
assert(proposalRoute.includes("WINNER_PROPOSAL_FORBIDDEN"), "winner proposal route must fail closed for unauthorized proposers.");
assert(proposalRoute.includes("ledgerEntriesCreated: false"), "winner proposal must not create ledger entries.");
assert(proposalRoute.includes("cashBalancesCredited: false"), "winner proposal must not credit cash balances.");
assert(proposalRoute.includes("payoutProviderCalled: false"), "winner proposal must not call payout provider.");

assert(adminQueueRoute.includes("requireAdminUser"), "admin prize queue must require admin.");
assert(adminListRoute.includes("requireAdminUser"), "admin challenge proposal list must require admin.");
assert(previewRoute.includes("requireAdminPermission"), "payout preview must require admin finance permission.");
assert(approveRoute.includes("requireRecentAdminAuthentication"), "approval must require recent admin authentication.");
assert(rejectRoute.includes("requireAdminPermission"), "reject must require admin winner-review permission.");
assert(changesRoute.includes("requireAdminPermission"), "request changes must require admin winner-review permission.");
assert(approveRoute.includes("createInternalChallengeSettlement"), "approval must call the idempotent internal settlement service.");
assert(approveRoute.includes("buildConfirmedSettlementPreview"), "admin approval must build a confirmed-source settlement preview.");
assert(settlement.includes("idempotent: true"), "internal settlement must be idempotent.");
assert(settlement.includes("pendingBalanceCents: FieldValue.increment(credit.netAmountCents)"), "admin approval must credit pending internal wallet balances.");
assert(approveRoute.includes("payoutProviderCalled: false"), "admin approval must not call payout provider.");
assert(approveRoute.includes("payoutMarkedPaid: false"), "admin approval must not mark payouts paid.");
assert(approveRoute.includes("kycStillRequiredBeforeWithdrawal: false"), "admin approval must follow the KYC-free launch policy.");
assert(rejectRoute.includes("ledgerEntriesCreated: false") && changesRoute.includes("ledgerEntriesCreated: false"), "reject/request-changes must not create ledger entries.");

assert(settlement.includes("getConfirmedEntryRevenueForChallenge"), "preview must source confirmed entry revenue.");
assert(settlement.includes("getConfirmedPaidVoteRevenueForChallenge"), "preview must source confirmed paid-vote revenue.");
assert(settlement.includes("getConfirmedSponsorContributionForChallenge"), "preview must source confirmed sponsor revenue.");
assert(settlement.includes("pendingFailedCancelledExcluded: true"), "unconfirmed payment states must be ignored.");
assert(settlement.includes("SPONSOR_PRIZE_PLATFORM_FEE_PERCENT = 15"), "sponsor prize must deduct one 15% platform fee at settlement.");
assert(settlement.includes("confirmedPaymentSourcesOnly: true"), "settlement must use confirmed sources only.");

assert(payout.includes("CASH_EARNING_HOLD_HOURS = 72"), "current 72-hour hold constant must exist.");
assert(helper.includes("holdUntilFromApproval") && helper.includes("CASH_EARNING_HOLD_HOURS"), "preview/finalization must calculate holdUntil from approval using the current hold.");
assert(settlement.includes("balanceBucket: \"pending\""), "winner funds must enter pending bucket only.");
assert(settlement.includes("status: \"pending_review\""), "internal credits must remain pending review.");
assert(settlement.includes("paid: false") && settlement.includes("withdrawn: false"), "settlement must not mark credits paid or withdrawn.");
assert(wallet.includes('kycRequired: isKycRequiredForAction("withdrawalRequest")'), "withdrawal architecture must use the centralized KYC policy.");
assert(wallet.includes("DoroCoins are internal platform credits. They cannot be withdrawn or converted to cash."), "DoroCoins must remain non-cash.");
assert(wallet.includes("Reward points are not cash and cannot be withdrawn."), "reward points must remain non-cash.");

assert(adminPage.includes("No prize approvals pending."), "admin page must show empty state instead of fake approvals.");
assert(adminPage.includes("Approval does not execute payouts or mark funds paid."), "admin page must state approval does not execute payouts.");
assert(adminPage.includes("Payout Provider Called"), "admin page must surface provider call safety.");
assert(adminPage.includes("Ledger Entries Created"), "admin page must surface ledger-entry safety.");
assert(!adminPage.includes("The Ultimate Showdown"), "admin prize approvals page must not show fake challenge data.");
assert(!adminPage.includes("$10,000") && !adminPage.includes("fake winner"), "admin prize approvals page must not show fake prize/winner data.");
assert(adminShell.includes("/admin/prize-approvals"), "admin navigation must include prize approvals.");

assert(!approveRoute.includes("stripe.transfers.create"), "approval route must not call Stripe transfers.");
assert(!approveRoute.includes("paystack.") && !approveRoute.includes("wise.") && !approveRoute.includes("paypal."), "approval route must not call payout providers.");
assert(!approveRoute.includes("status: \"paid\"") && !approveRoute.includes("balanceBucket: \"available\""), "approval route must not mark ledger paid or available.");
assert(!stripeWebhook.includes("winnerProposals") && !stripeWebhook.includes("ledgerFinalization"), "Stripe webhook must not be changed to finalize prize approvals.");

console.log("Admin prize approval and ledger finalization foundation checks passed.");
