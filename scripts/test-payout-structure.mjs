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
const sponsorshipRoute = read("app/api/sponsor/challenges/[id]/funding-checkout/route.ts");
const monetizationPayments = read("lib/server/monetization-payments.ts");
const sponsorDiscovery = read("app/api/sponsor/discover/challenges/route.ts");
const prizePools = read("lib/server/prize-pools.ts");
const withdrawalsRoute = read("app/api/withdrawals/route.ts");
const stripeWebhook = read("app/api/stripe/webhook/route.ts");
const planAccess = read("lib/plan-access.ts");

assert(exists("lib/server/payout-structure.ts"), "payout structure helper must exist.");

assert(payout.includes("MINIMUM_ENTRY_FEE_CENTS = 500"), "minimum entry fee must be $5.");
assert(payout.includes("CASH_EARNING_HOLD_HOURS = 72"), "current 72-hour hold must be configured.");
assert(payout.includes("winnerSharePercent: 65"), "paid revenue winner share must be 65%.");
assert(payout.includes("creatorHostOperatorSharePercent: 20"), "paid revenue creator/host/operator share must be 20%.");
assert(payout.includes("platformAdminSharePercent: 15"), "paid revenue platform/admin share must be 15%.");
assert(payout.includes("SPONSOR_CONTRIBUTION_SPLIT"), "sponsor contribution split must be explicit.");
assert(payout.includes("winnerSharePercent: 100"), "sponsor contribution must go 100% to winners.");
assert(payout.includes("futureSponsorServiceFeePercent: null"), "future sponsor service fee must remain setup-safe.");

assert(payout.includes("getChallengeMonetizationAccess"), "monetization access helper must exist.");
assert(payout.includes("Free users can fund their own cash prize."), "free users may prepare creator-funded cash prizes.");
assert(payout.includes("canPreparePaidEntry: paidCreatorFeatures"), "paid-entry setup must be plan-gated.");
assert(payout.includes("canPrepareSponsorReady: ownerAccount && access.canCreateSponsoredChallenges"), "sponsor-ready setup must be plan-gated.");
assert(payout.includes("canPreparePrizePool: ownerAccount"), "eligible challenge owners may prepare their own prize funding.");
assert(payout.includes("canPreparePaidVotes: paidCreatorFeatures"), "paid-vote setup must be plan-gated.");
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
assert(payout.includes("votingStarted"), "new sponsor funding must close when voting starts.");
assert(payout.includes("challenge.votingStartsAt ?? challenge.votingStartAt"), "sponsor funding cutoff must use the persisted voting start.");
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
assert(payout.includes("topThree") && payout.includes("percent: 50") && payout.includes("percent: 30") && payout.includes("percent: 20"), "default top-three winner split must be 50/30/20.");
assert(payout.includes("totalPercent === 100"), "winner split must require total 100%.");

assert(payout.includes("ledgerEntryFoundation"), "ledger foundation helper must exist.");
assert(walletArchitecture.includes("challengeId?: string | null"), "ledger shape must support challengeId.");
assert(walletArchitecture.includes("LedgerRevenueType"), "ledger shape must support revenue type.");
assert(walletArchitecture.includes("LedgerShareType"), "ledger shape must support share type.");
assert(walletArchitecture.includes("holdUntil?: string | null"), "ledger shape must support holdUntil.");
assert(walletArchitecture.includes("splitPercent?: number | null"), "ledger shape must support split percent.");
assert(walletArchitecture.includes("entry_fee") && walletArchitecture.includes("paid_vote") && walletArchitecture.includes("sponsor_contribution"), "ledger source types must include monetized challenge sources.");

assert(payout.includes("validateWithdrawalEligibility"), "withdrawal eligibility helper must exist.");
assert(payout.includes("WITHDRAWAL_ARCHITECTURE_CONFIG.kycRequired"), "withdrawal eligibility must defer to centralized policy.");
assert(payout.includes("createsProviderPayout: false") && payout.includes("marksPaidAutomatically: false"), "withdrawal request must not execute payout or mark paid automatically.");
assert(walletArchitecture.includes("DoroCoins are internal platform credits. They cannot be withdrawn or converted to cash."), "DoroCoins must not be withdrawable.");
assert(walletArchitecture.includes("Reward points are not cash and cannot be withdrawn."), "reward points must not be withdrawable.");

assert(revenueSharing.includes("paidEntryRevenueFoundation"), "paid entry revenue foundation must be exported.");
assert(revenueSharing.includes("paidVoteRevenueFoundation"), "paid vote revenue foundation must be exported.");
assert(revenueSharing.includes("sponsorContributionRevenueFoundation"), "sponsor contribution foundation must be exported.");
assert(revenuePage.includes("Paid Entry and Paid Vote Split Rules"), "revenue share page must document paid entry/vote split.");
assert(revenuePage.includes("Sponsor contribution split"), "revenue share page must document sponsor contribution handling.");
assert(!revenuePage.includes("Example uses $10,000") && !revenuePage.includes("$200 vote revenue"), "revenue share page must not show fake revenue examples.");

assert(sponsorshipRoute.includes("createPendingSponsorContribution"), "agreement-based sponsor checkout must create a pending source-linked contribution.");
assert(sponsorshipRoute.includes("webhookConfirmationRequired: true"), "sponsor funding must remain pending until webhook confirmation.");
assert(monetizationPayments.includes("validateSponsorFundingWindow(challenge).allowed"), "authoritative sponsor reservation must validate the funding window.");
assert(monetizationPayments.includes("confirmSponsorContribution"), "provider confirmation must use the authoritative sponsor contribution service.");
assert(!monetizationPayments.includes("mergeSponsorPrizePoolPlaceholder("), "sponsor pending state must not inflate the prize pool.");
assert(prizePools.includes("visibleJackpotCents: 0"), "sponsor prize pool placeholder must not show fake visible jackpot.");
assert(sponsorDiscovery.includes("metricsAreEstimated: false"), "sponsor discovery must not label fake estimated metrics as real.");
assert(!sponsorDiscovery.includes("Estimated reach foundation only"), "sponsor discovery must not expose fake reach copy.");
assert(!sponsorDiscovery.includes("Target audience foundation pending"), "sponsor discovery must not expose fake audience copy.");

assert(planAccess.includes("if (paid && !access.canCreatePaidChallenges)"), "paid entry must be unavailable on Free plans and authorized for eligible paid plans.");
assert(stripeWebhook.includes("confirmSponsorFundingFromProviderState(stripe, db, event, session)"), "Sponsor funding must verify the current Stripe Session and PaymentIntent before source-aware confirmation.");
assert(stripeWebhook.includes("checkout.session.async_payment_succeeded"), "unexpected asynchronous Sponsor payment methods must be routed to the financial review path.");
assert(monetizationPayments.includes("reservationCreatedAt") && monetizationPayments.includes("reservationExpiresAt"), "Sponsor reservations persist a fixed server timestamp and expiry.");
assert(monetizationPayments.includes("payment_review_required") && monetizationPayments.includes("refundCases"), "successful ineligible Sponsor payments must be linked to the established refund review queue.");
assert(stripeWebhook.includes("confirmCreatorPrizeFunding(db, event, session)"), "Creator prize funding must be confirmed through the source-aware webhook service.");
assert(!stripeWebhook.includes("stripe.transfers.create"), "Stripe webhook must not execute winner payouts.");
assert(withdrawalsRoute.includes("adminReviewRequired") && withdrawalsRoute.includes("payoutExecuted: false"), "withdrawal requests must remain admin-reviewed and non-paying.");
assert(!withdrawalsRoute.includes("stripe.transfers.create") && !withdrawalsRoute.includes("paystack.") && !withdrawalsRoute.includes("providerTransferId: \""), "withdrawal route must not execute provider payouts.");

console.log("Payout structure foundation checks passed.");
