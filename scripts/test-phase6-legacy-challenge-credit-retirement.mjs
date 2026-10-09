import assert from "node:assert/strict";
import { read } from "./production-flow-test-utils.mjs";

const checkout = read("app/api/challenge-credits/checkout/route.ts");
const transfer = read("app/api/challenge-credits/transfer/route.ts");
const packages = read("app/api/challenge-credits/packages/route.ts");
const adjustment = read("app/api/admin/economy-adjustments/route.ts");
const promotion = read("app/api/sponsor/campaigns/[campaignId]/promote/route.ts");
const paidVoteCheckout = read("app/api/challenges/[id]/paid-votes/checkout/route.ts");
const history = read("app/challenge-credits/page.tsx");
const vote = read("app/challenges/[id]/bonus-votes/page.tsx");
const schema = read("lib/server/vote-validation.ts");
const webhook = read("app/api/stripe/webhook/route.ts");

for (const route of [checkout, transfer, packages, adjustment, promotion]) {
  assert(route.includes("CHALLENGE_CREDITS_RETIRED"), "legacy Challenge Credit mutations must return 410");
}
assert(paidVoteCheckout.includes("PAID_VOTE_CHECKOUT_RETIRED"), "card-based paid vote checkout must be retired");
assert(history.includes("Legacy Challenge Credit History") && !history.includes("Buy Challenge Credits"), "legacy balances must be read-only");
assert(vote.includes("5 DoroCoins per additional vote") && vote.includes('voteMode: mode'), "extra votes must use 5 DoroCoins each");
assert(!vote.includes("Challenge Credits") && !schema.includes('"credits"'), "legacy credits cannot be used to vote");
assert(!webhook.includes("applyChallengeCreditTransaction"), "retired Challenge Credit payments must not issue wallet credits");
assert(webhook.includes("legacy_credit_purchase_review") && webhook.includes("automaticCreditIssued: false"), "paid legacy purchases must be preserved for manual review without issuing obsolete credits");
console.log("Phase 6 Challenge Credit retirement checks passed.");
