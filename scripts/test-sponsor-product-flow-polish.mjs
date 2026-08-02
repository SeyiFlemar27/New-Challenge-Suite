import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();
const read = (file) => readFileSync(join(root, file), "utf8");
const exists = (file) => existsSync(join(root, file));

const challengeList = read("app/sponsor/discover/challenges/page.tsx");
const challengeDetail = read("app/sponsor/discover/challenges/[challengeId]/page.tsx");
const fundingCheckout = read("app/sponsor/funding/[challengeId]/checkout/page.tsx");
const walletApi = read("app/api/sponsor/wallet/route.ts");

assert(challengeList.includes("sponsor-discovery-list"), "Sponsor challenge discovery should keep an organized discovery list.");
assert(challengeList.includes("grid gap-6") && challengeList.includes("Funding window"), "Opportunity cards should use roomy layout and show funding window.");
assert(challengeList.includes("Discuss Sponsorship") && challengeList.includes("/sponsor/messages?challengeId="), "Challenge cards should offer discussion CTA.");
assert(challengeList.includes("Fund Challenge") && challengeList.includes("/sponsor/funding/"), "Challenge cards should route to funding checkout.");
assert(challengeList.includes("statusLabel(challenge.fundingWindow?.reason)"), "Unavailable funding should show a clear reason.");
assert(challengeDetail.includes("discussSponsorship") && challengeDetail.includes("router.push(`/sponsor/messages/"), "Opportunity detail should open a real conversation.");
assert(challengeDetail.includes("Start Sponsor Funding Checkout") && challengeDetail.includes("webhook confirmation"), "Opportunity detail should preserve webhook-only funding copy.");
assert(exists("app/sponsor/funding/[challengeId]/checkout/page.tsx"), "Sponsor funding checkout route should exist.");
assert(fundingCheckout.includes("Direct Stripe checkout") && fundingCheckout.includes("Sponsor wallet balance (unavailable)"), "Funding checkout should support direct checkout and wallet foundation options.");
assert(fundingCheckout.includes("Sponsor wallet spending is not available yet"), "Wallet spending gap should be setup-safe.");
assert(walletApi.includes("availableBalanceCents") && walletApi.includes("reservedFundsCents") && walletApi.includes("pendingTransactionsCents"), "Sponsor wallet foundation should expose balance buckets.");
assert(!/fake sponsor money|fake funding|prize released|payout sent/i.test(challengeList + challengeDetail + fundingCheckout), "Sponsor flow must not fake funding or payouts.");

console.log("Sponsor product flow polish checks passed.");
