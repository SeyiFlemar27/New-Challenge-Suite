import assert from "node:assert/strict";
import { read } from "./production-flow-test-utils.mjs";
for (const file of ["lib/server/monetization-payments.ts", "lib/server/challenge-production-flow.ts", "lib/server/withdrawals.ts", "app/api/withdrawals/route.ts"]) {
  const text = read(file);
  assert(!text.includes("stripe.refunds.create") && !text.includes("stripe.transfers.create") && !text.includes("payouts.create"), `${file} must not execute payouts/refunds/transfers`);
}
assert(read("lib/server/challenge-production-flow.ts").includes("sponsorFundsExcludedFromGeneratedRevenue: true"), "sponsor funds must stay separate from generated revenue");
assert(read("lib/server/payout-structure.ts").includes("winnerSharePercent: 65"), "paid-entry revenue split guardrail must remain canonical");
console.log("money safety production guardrails checks passed");