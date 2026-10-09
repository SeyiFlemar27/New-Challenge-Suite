import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();
const read = (file) => readFileSync(join(root, file), "utf8");
const exists = (file) => existsSync(join(root, file));

const checkoutRoute = read("app/api/sponsor/challenges/[id]/funding-checkout/route.ts");
const creatorPrizeCheckout = read("app/api/challenges/[id]/prize-funding/checkout/route.ts");
const entryCheckout = read("app/api/challenges/[id]/entry-checkout/route.ts");
const statusRoute = read("app/api/sponsor/contributions/[id]/route.ts");
const detailRoute = read("app/api/sponsor/discover/challenges/[challengeId]/route.ts");
const detailPage = read("app/sponsor/discover/challenges/[challengeId]/page.tsx");
const webhook = read("app/api/stripe/webhook/route.ts");
const helper = read("lib/server/monetization-payments.ts");

assert(exists("app/api/sponsor/challenges/[id]/funding-checkout/route.ts"), "sponsor funding checkout route must exist.");
assert(exists("app/api/sponsor/contributions/[id]/route.ts"), "sponsor contribution status route must exist.");
assert(checkoutRoute.includes("requireSponsorContext"), "sponsor funding must require sponsor context.");
assert(checkoutRoute.includes("requireSponsorPermission(context, \"sponsorship.manage\")"), "agreement-based funding requires sponsorship-management permission.");
assert(checkoutRoute.includes("sponsorIsApproved") && checkoutRoute.includes("hasActiveSponsorSubscription"), "sponsor funding must keep approval/plan gate.");
assert(checkoutRoute.includes("createPendingSponsorContribution"), "sponsor funding must create pending contribution foundation.");
assert(checkoutRoute.includes("agreementId") && checkoutRoute.includes("SPONSOR_AGREEMENT_NOT_ACCEPTED"), "funding must derive amount and terms from a mutually accepted agreement.");
assert(helper.includes("sponsorChallengeAgreements") && helper.includes("creatorAcceptedVersion") && helper.includes("sponsorAcceptedVersion"), "pending contribution reservation must verify both accepted agreement versions transactionally.");
assert(checkoutRoute.includes("getRequestIdempotencyKey") && checkoutRoute.includes("sponsor_challenge_funding_"), "Sponsor prize funding checkout creation must use a request idempotency key.");
assert(helper.includes("existing.idempotencyKey !== requestKey") && helper.includes("const id = deterministicId(\"sponsor_funding\""), "duplicate Sponsor requests must resolve to one reserved contribution record.");
assert(creatorPrizeCheckout.includes("creator_prize_funding_${payment.id}"), "creator prize Checkout Session creation must be idempotent by reserved payment.");
assert(entryCheckout.includes("challenge_entry_${record.id}"), "paid-entry Checkout Session creation must be idempotent by reserved entry payment.");
assert(checkoutRoute.includes("paymentPurpose=sponsor_funding"), "checkout success URL must carry sponsor_funding purpose.");
assert(checkoutRoute.includes("checkoutSuccessConfirmsContribution: false"), "checkout route must not confirm sponsor contribution.");
assert(detailPage.includes("Send Interest and Proposed Terms") && detailPage.includes("Fund Accepted Sponsorship"), "Sponsor detail UI must gate checkout behind interest and mutual acceptance.");
assert(detailPage.includes("Webhook confirmation is required") && detailPage.includes("Payment pending provider confirmation"), "sponsor UI must distinguish pending checkout from confirmed funding.");
assert(detailPage.includes("No sponsor money, prize pool growth, public brand placement, ledger entry, payout, or winner payment"), "sponsor UI must not fake money movement.");
assert(detailRoute.includes("confirmedSponsorContributionWinnerShareCents"), "sponsor discovery must prefer confirmed contribution fields.");
assert(webhook.includes("paymentPurpose === \"sponsor_funding\""), "webhook must branch for sponsor_funding.");
assert(webhook.includes("confirmSponsorContribution"), "webhook must confirm sponsor contribution via helper.");
assert(helper.includes("assertStripeSessionMatchesRecord(session, contribution, \"sponsor_funding\")"), "sponsor funding confirmation must verify stored payment record.");
assert(helper.includes("confirmedSponsorContributionWinnerShareCents"), "confirmed sponsor contribution must become winner-share source.");
assert(helper.includes("sponsorContributionGoesFullyToWinners: true"), "sponsor contribution must go 100% to winners.");
assert(helper.includes("brandingStatus") && helper.includes("pending_review"), "sponsor branding must remain pending review.");
assert(helper.includes("sponsorBrandingAutoApproved: false") || helper.includes("brandingAutoApproved: false"), "sponsor branding must not auto-approve.");
assert(helper.includes("if (contribution.status === \"confirmed\")"), "sponsor contribution confirmation must be idempotent.");
assert(webhook.includes("checkout.session.expired") && helper.includes("expireSponsorContribution"), "expired sponsor checkout state must be tracked.");
assert(!helper.includes("stripe.transfers.create") && !helper.includes("payouts.create"), "sponsor funding foundation must not execute payouts.");
assert(!webhook.includes("finalizeApprovedWinnerProposalLedger"), "webhook must not finalize winner ledgers in this pass.");
assert(webhook.includes("session.mode === \"subscription\""), "subscription webhook branch must remain present.");

console.log("Sponsor funding checkout foundation checks passed.");

