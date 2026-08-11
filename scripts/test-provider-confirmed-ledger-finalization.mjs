import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();
const read = (file) => readFileSync(join(root, file), "utf8");
const exists = (file) => existsSync(join(root, file));

const helper = read("lib/server/prize-approvals.ts");
const settlement = read("lib/server/challenge-settlement.ts");
const finalizeRoute = read("app/api/admin/challenges/[id]/winner-proposals/[proposalId]/finalize-ledger/route.ts");
const approveRoute = read("app/api/admin/challenges/[id]/winner-proposals/[proposalId]/approve/route.ts");
const stripeWebhook = read("app/api/stripe/webhook/route.ts");

assert(exists("app/api/admin/challenges/[id]/winner-proposals/[proposalId]/finalize-ledger/route.ts"), "finalize-ledger route must exist.");
assert(helper.includes("finalizeApprovedWinnerProposalLedger"), "finalization helper must exist.");
assert(helper.includes("proposal.status !== \"approved\""), "finalization must require admin-approved proposal.");
assert(helper.includes("validateWinnerProposalWinners"), "finalization must validate winner split.");
assert(settlement.includes("getConfirmedEntryRevenueForChallenge") && settlement.includes("getConfirmedPaidVoteRevenueForChallenge"), "finalization must use confirmed paid entry/vote records.");
assert(settlement.includes("getConfirmedSponsorContributionForChallenge"), "finalization must use confirmed sponsor records.");
assert(settlement.includes("pendingFailedCancelledExcluded: true"), "unconfirmed sponsor contributions must be ignored.");
assert(settlement.includes("creatorHostAmount"), "creator/host share must be calculated.");
assert(settlement.includes("platformChallengeFeeAmount"), "platform share must be calculated.");
assert(settlement.includes("balanceBucket: \"pending\""), "ledger entries must enter pending bucket.");
assert(settlement.includes("status: \"pending_review\""), "ledger entries must remain pending review.");
assert(settlement.includes("holdUntil"), "ledger entries must include holdUntil.");
assert(settlement.includes("CASH_EARNING_HOLD_HOURS"), "24-hour hold configuration must be reused.");
assert(settlement.includes("kycRequiredBeforeWithdrawal: false"), "internal credits must follow the KYC-free launch policy.");
assert(settlement.includes("payoutProviderCalled: false"), "settlement must not call payout provider.");
assert(settlement.includes("paid: false") && settlement.includes("withdrawn: false"), "ledger entries must not be marked paid or withdrawn.");
assert(settlement.includes("idempotencyKey"), "ledger entries must include idempotency keys.");
assert(settlement.includes("idempotent: true"), "settlement must return existing records idempotently.");

assert(finalizeRoute.includes("requireRecentAdminAuthentication"), "finalize route must require recent admin authentication.");
assert(finalizeRoute.includes("writeAuditLog"), "finalize route must audit attempts.");
assert(finalizeRoute.includes("payoutProviderCalled: false"), "finalize route must not call provider.");
assert(approveRoute.includes("createInternalChallengeSettlement"), "approve route must create internal settlement automatically.");
assert(!settlement.includes("stripe.transfers.create") && !settlement.includes("paystack.") && !settlement.includes("paypal."), "settlement must not call payout providers.");
assert(!stripeWebhook.includes("finalizeApprovedWinnerProposalLedger"), "Stripe webhook must not finalize winner ledgers in this pass.");

console.log("Provider-confirmed ledger finalization foundation checks passed.");
