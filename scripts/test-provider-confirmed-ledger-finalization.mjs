import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();
const read = (file) => readFileSync(join(root, file), "utf8");
const exists = (file) => existsSync(join(root, file));

const helper = read("lib/server/prize-approvals.ts");
const finalizeRoute = read("app/api/admin/challenges/[id]/winner-proposals/[proposalId]/finalize-ledger/route.ts");
const approveRoute = read("app/api/admin/challenges/[id]/winner-proposals/[proposalId]/approve/route.ts");
const stripeWebhook = read("app/api/stripe/webhook/route.ts");

assert(exists("app/api/admin/challenges/[id]/winner-proposals/[proposalId]/finalize-ledger/route.ts"), "finalize-ledger route must exist.");
assert(helper.includes("finalizeApprovedWinnerProposalLedger"), "finalization helper must exist.");
assert(helper.includes("proposal.status !== \"approved\""), "finalization must require admin-approved proposal.");
assert(helper.includes("winnerProposalLifecycleReadiness"), "finalization must verify challenge lifecycle readiness.");
assert(helper.includes("validateWinnerProposalWinners"), "finalization must validate winner split.");
assert(helper.includes("awaiting_confirmed_payments"), "finalization must block without confirmed payment sources.");
assert(helper.includes("No confirmed payment sources available for ledger finalization."), "finalization must report missing confirmed sources.");
assert(helper.includes("confirmedEntryFeeGrossCents") && helper.includes("confirmedPaidVoteGrossCents"), "finalization must use confirmed gross paid entry/vote sources.");
assert(helper.includes("confirmedSponsorContributionWinnerShareCents"), "finalization must use confirmed sponsor contribution sources.");
assert(helper.includes("unconfirmedSponsorContributionIgnored: true"), "unconfirmed sponsor contributions must be ignored.");
assert(helper.includes("sponsorContributionGoesFullyToWinners: true"), "sponsor contribution must go 100% to winners.");
assert(helper.includes("creatorHostOperatorShareCents"), "creator/host/operator share must be calculated.");
assert(helper.includes("platformAdminShareCents"), "platform/admin share must be calculated.");
assert(helper.includes("platformShareRecordedAtPaymentConfirmation"), "platform share duplication guard must exist.");
assert(helper.includes("balanceBucket: \"pending\""), "ledger entries must enter pending bucket.");
assert(helper.includes("status: \"pending_hold\""), "ledger entries must be pending hold.");
assert(helper.includes("holdUntil"), "ledger entries must include holdUntil.");
assert(helper.includes("CASH_EARNING_HOLD_HOURS"), "24-hour hold configuration must be reused.");
assert(helper.includes("kycRequiredBeforeWithdrawal: true"), "KYC must remain required before withdrawal.");
assert(helper.includes("payoutProviderCalled: false"), "finalization must not call payout provider.");
assert(helper.includes("paid: false") && helper.includes("withdrawn: false"), "ledger entries must not be marked paid or withdrawn.");
assert(helper.includes("idempotencyKey"), "ledger entries must include idempotency keys.");
assert(helper.includes("already_finalized"), "finalization must be idempotent for already finalized proposals.");

assert(finalizeRoute.includes("requireAdminUser"), "finalize route must require admin.");
assert(finalizeRoute.includes("writeAuditLog"), "finalize route must audit attempts.");
assert(finalizeRoute.includes("payoutProviderCalled: false"), "finalize route must not call provider.");
assert(approveRoute.includes("ledgerEntriesCreated: false"), "approve route must not finalize ledger automatically.");
assert(!helper.includes("stripe.transfers.create") && !helper.includes("paystack.") && !helper.includes("paypal."), "helper must not call payout providers.");
assert(!stripeWebhook.includes("finalizeApprovedWinnerProposalLedger"), "Stripe webhook must not finalize winner ledgers in this pass.");

console.log("Provider-confirmed ledger finalization foundation checks passed.");
