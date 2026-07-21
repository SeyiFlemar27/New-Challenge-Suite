import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();
const read = (file) => readFileSync(join(root, file), "utf8");
const exists = (file) => existsSync(join(root, file));

const payout = read("lib/server/payout-structure.ts");
const walletArchitecture = read("lib/server/wallet-architecture.ts");
const revenueSharing = read("lib/server/revenue-sharing.ts");
const revenuePage = read("app/revenue-share/page.tsx");
const sponsorshipRoute = read("app/api/challenges/[id]/sponsorships/route.ts");
const sponsorDiscovery = read("app/api/sponsor/discover/challenges/route.ts");
const prizePools = read("lib/server/prize-pools.ts");
const withdrawalsRoute = read("app/api/withdrawals/route.ts");
const stripeWebhook = read("app/api/stripe/webhook/route.ts");
const planAccess = read("lib/plan-access.ts");

assert(exists("lib/server/payout-structure.ts"), "payout structure helper must exist.");

assert(payout.includes("MINIMUM_ENTRY_FEE_CENTS = 500"), "minimum entry fee must be $5.");
assert(payout.includes("CASH_EARNING_HOLD_HOURS = 24"), "24-hour hold must be configured.");
assert(payout.includes("winnerSharePercent: 65"), "paid revenue winner share must be 65%.");
assert(payout.includes("creatorHostOperatorSharePercent: 20"), "paid revenue creator/host/operator share must be 20%.");
assert(payout.includes("platformAdminSharePercent: 15"), "paid revenue platform/admin share must be 15%.");
assert(payout.includes("SPONSOR_CONTRIBUTION_SPLIT"), "sponsor contribution split must be explicit.");
assert(payout.includes("winnerSharePercent: 100"), "sponsor contribution must go 100% to winners.");
assert(payout.includes("futureSponsorServiceFeePercent: null"), "future sponsor service fee must remain setup-safe.");

assert(payout.includes("getChallengeMonetizationAccess"), "monetization access helper must exist.");
assert(payout.includes("Free users can create basic non-monetized public challenges only."), "free users must be locked out of monetized challenge options.");
assert(payout.includes("canPreparePaidEntry: earningAccount"), "creator/host/approved enterprise should be able to prepare paid-entry options.");
assert(payout.includes("canPrepareSponsorReady: earningAccount"), "creator/host/approved enterprise should be able to prepare sponsor-ready options.");
assert(payout.includes("canPreparePrizePool: earningAccount"), "creator/host/approved enterprise should be able to prepare prize-pool options.");
assert(payout.includes("canPreparePaidVotes: earningAccount"), "creator/host/approved enterprise should be able to prepare paid-vote options.");
assert(payout.includes("paidEntryPaymentActive: false"), "paid entry payment execution must remain disabled.");
assert(payout.includes("sponsorFundingPaymentActive: false"), "sponsor funding payment execution must remain disabled.");

assert(payout.includes("calculatePaidRevenueSplit"), "paid revenue split helper must exist.");
assert(payout.includes("platformShareTiming: \"after_provider_payment_confirmation\""), "platform share timing must be after payment confirmation.");
assert(payout.includes("reversalPathwayRequired: true"), "refund/dispute reversal pathway must exist or be documented.");
assert(payout.includes("winnerShareStatus: \"pending_winner_admin_approval\""), "winner share must require admin approval.");
assert(payout.includes("creatorHostOperatorShareStatus: \"pending_24_hour_hold\""), "creator/host/operator share must go through hold.");

assert(payout.includes("calculateSponsorContributionSplit"), "sponsor contribution helper must exist.");
assert(payout.includes("paymentConfirmationRequired: true"), "sponsor contribution must require payment confirmation.");
assert(payout.includes("sponsorContributionStatus: \"awaiting_provider_confirmation\""), "sponsor contribution must not be treated as funded before provider confirmation.");

assert(payout.includes("validateSponsorFundingWindow"), "sponsor funding window helper must exist.");
assert(payout.includes("votingClosed"), "sponsor funding must close when voting closes.");
assert(payout.includes("winnersApprovedAt") && payout.includes("adminWinnersApprovedAt"), "sponsor funding must close after winners are approved.");
assert(payout.includes("cancelled") && payout.includes("paused") && payout.includes("completed"), "sponsor funding must reject terminal challenge statuses.");

assert(payout.includes("SPONSOR_BRAND_PLACEMENTS"), "sponsor brand placement foundation must exist.");
assert(payout.includes("challenge_detail") && payout.includes("voting_page") && payout.includes("leaderboard") && payout.includes("winner_announcement") && payout.includes("share_card"), "sponsor placements must cover core challenge surfaces.");
assert(payout.includes("analyticsEnabled: false") && payout.includes("fakeAnalyticsAllowed: false"), "sponsor analytics must not be faked.");
assert(payout.includes("sponsorshipDiscussionFoundation"), "sponsor-to-creator discussion foundation must exist.");
assert(payout.includes("messagingEnabled: false") && payout.includes("fakeMessageSent: false"), "sponsor discussion must not fake messages.");

assert(payout.includes("calculateWinnerPrizePool"), "winner prize pool helper must exist.");
assert(payout.includes("sponsorContributionExcludedFromCreatorPlatformSplit: true"), "sponsor contribution must not enter creator/platform split.");
assert(payout.includes("calculateWinnerDistribution"), "winner split helper must exist.");
assert(payout.includes("topThree") && payout.includes("percent: 70") && payout.includes("percent: 20") && payout.includes("percent: 10"), "default top-three winner split must be 70/20/10.");
assert(payout.includes("totalPercent === 100"), "winner split must require total 100%.");

assert(payout.includes("ledgerEntryFoundation"), "ledger foundation helper must exist.");
assert(walletArchitecture.includes("challengeId?: string | null"), "ledger shape must support challengeId.");
assert(walletArchitecture.includes("LedgerRevenueType"), "ledger shape must support revenue type.");
assert(walletArchitecture.includes("LedgerShareType"), "ledger shape must support share type.");
assert(walletArchitecture.includes("holdUntil?: string | null"), "ledger shape must support holdUntil.");
assert(walletArchitecture.includes("splitPercent?: number | null"), "ledger shape must support split percent.");
assert(walletArchitecture.includes("entry_fee") && walletArchitecture.includes("paid_vote") && walletArchitecture.includes("sponsor_contribution"), "ledger source types must include monetized challenge sources.");

assert(payout.includes("validateWithdrawalEligibility"), "withdrawal eligibility helper must exist.");
assert(payout.includes("kyc_required"), "withdrawal eligibility must require KYC.");
assert(payout.includes("createsProviderPayout: false") && payout.includes("marksPaidAutomatically: false"), "withdrawal request must not execute payout or mark paid automatically.");
assert(walletArchitecture.includes("DoroCoins are internal platform credits. They cannot be withdrawn or converted to cash."), "DoroCoins must not be withdrawable.");
assert(walletArchitecture.includes("Reward points are not cash and cannot be withdrawn."), "reward points must not be withdrawable.");

assert(revenueSharing.includes("paidEntryRevenueFoundation"), "paid entry revenue foundation must be exported.");
assert(revenueSharing.includes("paidVoteRevenueFoundation"), "paid vote revenue foundation must be exported.");
assert(revenueSharing.includes("sponsorContributionRevenueFoundation"), "sponsor contribution foundation must be exported.");
assert(revenuePage.includes("Paid Entry and Paid Vote Split Rules"), "revenue share page must document paid entry/vote split.");
assert(revenuePage.includes("Sponsor contribution split"), "revenue share page must document sponsor contribution handling.");
assert(!revenuePage.includes("Example uses $10,000") && !revenuePage.includes("$200 vote revenue"), "revenue share page must not show fake revenue examples.");

assert(sponsorshipRoute.includes("validateSponsorFundingWindow"), "sponsor proposal route must validate funding window.");
assert(sponsorshipRoute.includes("paymentConfirmationRequired: true"), "sponsor proposal must require payment confirmation.");
assert(sponsorshipRoute.includes("prizePoolCreditStatus: \"awaiting_provider_confirmation\""), "sponsor proposal must not credit prize pool before payment confirmation.");
assert(!sponsorshipRoute.includes("mergeSponsorPrizePoolPlaceholder("), "sponsor proposal route must not inflate prize pool before confirmed payment.");
assert(prizePools.includes("visibleJackpotCents: 0"), "sponsor prize pool placeholder must not show fake visible jackpot.");
assert(sponsorDiscovery.includes("metricsAreEstimated: false"), "sponsor discovery must not label fake estimated metrics as real.");
assert(!sponsorDiscovery.includes("Estimated reach foundation only"), "sponsor discovery must not expose fake reach copy.");
assert(!sponsorDiscovery.includes("Target audience foundation pending"), "sponsor discovery must not expose fake audience copy.");

assert(planAccess.includes("PAID_ENTRY_DISABLED"), "existing challenge creation gate must keep paid entry disabled until backend is ready.");
assert(!stripeWebhook.includes("sponsorContribution") && !stripeWebhook.includes("prizePoolCreditStatus"), "Stripe webhook must not release sponsor funds in this pass.");
assert(withdrawalsRoute.includes("WITHDRAWALS_SETUP_REQUIRED"), "withdrawal request route must remain setup-safe.");
assert(!withdrawalsRoute.includes("stripe.transfers.create") && !withdrawalsRoute.includes("paystack.") && !withdrawalsRoute.includes("providerTransferId: \""), "withdrawal route must not execute provider payouts.");

console.log("Payout structure foundation checks passed.");
