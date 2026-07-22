import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();
const read = (file) => readFileSync(join(root, file), "utf8");
const exists = (file) => existsSync(join(root, file));

const checkoutRoute = read("app/api/sponsor/challenges/[id]/funding-checkout/route.ts");
const statusRoute = read("app/api/sponsor/contributions/[id]/route.ts");
const detailRoute = read("app/api/sponsor/discover/challenges/[challengeId]/route.ts");
const detailPage = read("app/sponsor/discover/challenges/[challengeId]/page.tsx");
const webhook = read("app/api/stripe/webhook/route.ts");
const helper = read("lib/server/monetization-payments.ts");

assert(exists("app/api/sponsor/challenges/[id]/funding-checkout/route.ts"), "sponsor funding checkout route must exist.");
assert(exists("app/api/sponsor/contributions/[id]/route.ts"), "sponsor contribution status route must exist.");
assert(checkoutRoute.includes("requireSponsorContext"), "sponsor funding must require sponsor context.");
assert(checkoutRoute.includes("sponsorIsApproved") && checkoutRoute.includes("hasActiveSponsorSubscription"), "sponsor funding must keep approval/plan gate.");
assert(checkoutRoute.includes("createPendingSponsorContribution"), "sponsor funding must create pending contribution foundation.");
assert(checkoutRoute.includes("paymentPurpose=sponsor_funding"), "checkout success URL must carry sponsor_funding purpose.");
assert(checkoutRoute.includes("checkoutSuccessConfirmsContribution: false"), "checkout route must not confirm sponsor contribution.");
assert(detailPage.includes("Start Sponsor Funding Checkout"), "sponsor detail UI must expose funding checkout foundation.");
assert(detailPage.includes("checkout success does not confirm funding") || detailPage.includes("Checkout success does not confirm funding"), "sponsor UI must not claim success-page confirmation.");
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

