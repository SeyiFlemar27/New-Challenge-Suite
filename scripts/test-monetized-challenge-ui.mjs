import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();
const read = (file) => readFileSync(join(root, file), "utf8");
const exists = (file) => existsSync(join(root, file));

const builder = read("components/challenge-builder.tsx");
const challengeRoute = read("app/api/challenges/route.ts");
const challengeValidation = read("lib/server/challenge-validation.ts");
const sponsorDiscoveryPage = read("app/sponsor/discover/challenges/page.tsx");
const sponsorDiscoveryRoute = read("app/api/sponsor/discover/challenges/route.ts");
const sponsorDetailPage = read("app/sponsor/discover/challenges/[challengeId]/page.tsx");
const sponsorDetailRoute = read("app/api/sponsor/discover/challenges/[challengeId]/route.ts");
const payoutStructure = read("lib/server/payout-structure.ts");
const withdrawalsRoute = read("app/api/withdrawals/route.ts");
const stripeWebhook = read("app/api/stripe/webhook/route.ts");

assert(exists("scripts/test-monetized-challenge-ui.mjs"), "monetized challenge UI test must exist.");

assert(builder.includes("Monetization & Prize Pool"), "builder must include a monetization step.");
assert(builder.includes("Choose how this challenge can be funded."), "builder monetization copy must be setup-safe.");
assert(builder.includes("Monetized challenges are available to Creator, Host, and approved Enterprise accounts."), "free users must see monetization lock copy.");
assert(builder.includes("Free Basic challenges remain public, non-prize, and non-monetized."), "free users must be limited to non-monetized challenges.");
assert(builder.includes("Enable Paid Entry"), "paid entry toggle must exist for eligible accounts.");
assert(builder.includes("Minimum entry fee is $5."), "paid entry UI must show the $5 minimum.");
assert(builder.includes("Entry fee must be at least $5."), "paid entry UI must block invalid amounts.");
assert(builder.includes("Make this challenge Sponsor Ready"), "sponsor-ready option must exist.");
assert(builder.includes("Sponsor-ready challenges can appear in Sponsor Discovery after publish."), "sponsor-ready copy must explain discovery safely.");
assert(builder.includes("Enable Prize Pool"), "prize pool toggle must exist.");
assert(builder.includes("65% of paid entry revenue goes to winners."), "prize pool copy must explain paid-entry winner share.");
assert(builder.includes("65% of paid vote revenue goes to winners."), "prize pool copy must explain paid-vote winner share.");
assert(builder.includes("100% of confirmed sponsor contributions goes to winners."), "prize pool copy must explain sponsor contribution handling.");
assert(builder.includes("Enable Paid Votes"), "paid votes control must exist.");
assert(builder.includes("Paid votes setup required."), "paid votes must remain setup-safe.");
assert(builder.includes("Monetization Preview"), "builder must show monetization preview panel.");
assert(builder.includes("Rules, not actual earnings"), "builder preview must not claim actual earnings.");
assert(builder.includes("Estimates are not saved as revenue and do not create ledger entries."), "builder estimates must not be revenue.");
assert(builder.includes("ledgerCreationEnabled: false"), "builder must not enable ledger creation.");
assert(builder.includes("checkoutActive: false"), "builder must not enable checkout.");
assert(builder.includes("paidEntryEnabled: false"), "builder must keep top-level paid entry inactive.");
assert(builder.includes("prizePoolEnabled: false"), "builder must keep top-level prize pool inactive.");
assert(builder.includes("sponsorEnabled: safeSponsorReady"), "builder may only mark sponsor-ready through safe eligibility state.");
assert(!builder.match(/\bFiverr\b|\bgig\b|\bbuyer\b|\bseller\b/i), "builder must not include forbidden marketplace copy.");

assert(challengeValidation.includes("monetization: z.object"), "challenge schema must accept safe monetization metadata.");
assert(challengeValidation.includes("paymentActive: z.coerce.boolean().default(false)"), "monetization schema must default payment inactive.");
assert(challengeValidation.includes("ledgerCreationEnabled: z.coerce.boolean().default(false)"), "monetization schema must default ledger inactive.");
assert(challengeRoute.includes("getChallengeMonetizationAccess"), "challenge API must use monetization access helper.");
assert(challengeRoute.includes("validateEntryFee"), "challenge API must validate entry fee server-side.");
assert(challengeRoute.includes("MONETIZATION_LOCKED"), "challenge API must reject locked monetization intent.");
assert(challengeRoute.includes("ENTRY_FEE_MINIMUM"), "challenge API must reject invalid paid-entry amounts.");
assert(challengeRoute.includes("PAID_VOTES_SETUP_REQUIRED"), "challenge API must keep paid votes setup-safe.");
assert(challengeRoute.includes("safeMonetization"), "challenge API must sanitize monetization before persistence.");
assert(challengeRoute.includes("ledgerCreationEnabled: false"), "challenge API must not create ledger entries from builder submission.");
assert(challengeRoute.includes("checkoutActive: false"), "challenge API must not activate checkout from builder submission.");
assert(challengeRoute.includes("cashHoldHours: 24"), "challenge monetization metadata must note 24-hour hold.");

assert(payoutStructure.includes("MINIMUM_ENTRY_FEE_CENTS = 500"), "payout foundation must keep $5 minimum.");
assert(payoutStructure.includes("winnerSharePercent: 65"), "paid revenue winner split must remain 65%.");
assert(payoutStructure.includes("creatorHostOperatorSharePercent: 20"), "paid revenue creator/host/operator split must remain 20%.");
assert(payoutStructure.includes("platformAdminSharePercent: 15"), "paid revenue platform/admin split must remain 15%.");
assert(payoutStructure.includes("winnerSharePercent: 100"), "sponsor contribution must go 100% to winners.");

assert(sponsorDiscoveryRoute.includes("if (!sponsorReady) return null"), "sponsor discovery API must show sponsor-ready challenges only.");
assert(sponsorDiscoveryRoute.includes("validateSponsorFundingWindow"), "sponsor discovery API must expose funding window safely.");
assert(sponsorDiscoveryRoute.includes("currentPrizePoolCents"), "sponsor discovery API must expose real/zero prize pool value.");
assert(sponsorDiscoveryPage.includes("No sponsor-ready challenges yet."), "sponsor discovery must have a clean empty state.");
assert(sponsorDiscoveryPage.includes("Challenges marked Sponsor Ready will appear here after they are published."), "sponsor discovery empty state must be clear.");
assert(sponsorDiscoveryPage.includes("Fund setup required"), "sponsor discovery funding CTA must be setup-safe.");
assert(!sponsorDiscoveryPage.includes("Estimated reach foundation only"), "sponsor discovery must not show fake reach copy.");
assert(!sponsorDiscoveryPage.includes("fake"), "sponsor discovery UI must not include fake labels.");

assert(sponsorDetailRoute.includes("if (!sponsorReady) return fail"), "sponsor detail API must reject non-sponsor-ready challenges.");
assert(sponsorDetailRoute.includes("sponsorshipDiscussionFoundation"), "sponsor detail API must expose discussion foundation only.");
assert(sponsorDetailRoute.includes("Sponsor funding checkout is not available yet."), "sponsor detail API must keep funding setup-safe.");
assert(sponsorDetailRoute.includes("fundingEnabled: false"), "sponsor detail API must not enable funding.");
assert(sponsorDetailPage.includes("Discuss Sponsorship"), "sponsor detail must include discussion CTA.");
assert(sponsorDetailPage.includes("Fund Challenge"), "sponsor detail must include fund challenge CTA.");
assert(sponsorDetailPage.includes("Funding setup required"), "sponsor detail must not fake payment availability.");
assert(sponsorDetailPage.includes("No message, email, payment, or prize pool credit is created from this page."), "sponsor detail must not fake messages or funding.");
assert(sponsorDetailPage.includes("Confirmed sponsor payment required"), "sponsor detail must explain provider confirmation.");
assert(!sponsorDetailPage.includes("Message sent"), "sponsor detail must not fake sent messages.");
assert(!sponsorDetailPage.includes("Payment complete"), "sponsor detail must not fake payment.");

assert(!challengeRoute.includes("stripe.checkout.sessions.create"), "challenge builder must not create checkout sessions.");
assert(!challengeRoute.includes("revenueLedgerEntries") && !challengeRoute.includes("createLedgerEntry("), "challenge builder route must not create revenue ledger entries.");
assert(!stripeWebhook.includes("sponsorContribution") && !stripeWebhook.includes("paidEntryRequested"), "Stripe webhook must not be changed for this UI pass.");
assert(withdrawalsRoute.includes("WITHDRAWALS_SETUP_REQUIRED"), "withdrawals must remain setup-safe.");
assert(!withdrawalsRoute.includes("providerTransferId: \"") && !withdrawalsRoute.includes("markPaid"), "withdrawals must not execute payouts or mark paid.");

console.log("Monetized challenge UI foundation checks passed.");
