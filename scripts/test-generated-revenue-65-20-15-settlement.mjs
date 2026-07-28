import assert from "node:assert/strict";
import { read } from "./production-flow-test-utils.mjs";
const payout = read("lib/server/payout-structure.ts");
const payments = read("lib/server/monetization-payments.ts");
const flow = read("lib/server/challenge-production-flow.ts");
assert(payout.includes("winnerSharePercent: 65") && payout.includes("creatorHostOperatorSharePercent: 20") && payout.includes("platformAdminSharePercent: 15"), "generated revenue split must remain 65/20/15");
assert(payments.includes("calculatePaidRevenueSplit(amountCents, \"entry_fee\")") && payments.includes("calculatePaidRevenueSplit(amountCents, \"paid_vote\")"), "entry fee and paid vote revenue must reuse canonical split helper");
assert(flow.includes("verifiedEntryRevenueCents") && flow.includes("creatorHostPendingRevenueCents") && flow.includes("platformPendingRevenueCents"), "settlement preview must expose pending allocation buckets");
console.log("generated revenue 65/20/15 settlement checks passed");