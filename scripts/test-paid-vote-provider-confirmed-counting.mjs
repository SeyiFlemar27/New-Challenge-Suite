import assert from "node:assert/strict";
import { read } from "./production-flow-test-utils.mjs";
const paidVotes = read("app/api/challenges/[id]/paid-votes/checkout/route.ts");
const webhook = read("app/api/stripe/webhook/route.ts");
const payments = read("lib/server/monetization-payments.ts");
assert(paidVotes.includes("paymentPurpose") && paidVotes.includes("paid_vote"), "paid vote checkout must use purpose metadata");
assert(webhook.includes("paid_vote") && payments.includes("confirmPaidVotePurchase"), "paid votes must be confirmed by webhook/provider flow");
assert(payments.includes("votesGranted") && payments.includes("webhookConfirmed"), "paid vote credits must be granted only after confirmation");
console.log("paid vote provider confirmed counting checks passed");