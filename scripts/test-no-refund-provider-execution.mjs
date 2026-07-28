import assert from "node:assert/strict";
import { read } from "./production-flow-test-utils.mjs";
for (const file of ["lib/server/challenge-production-flow.ts", "lib/server/monetization-payments.ts", "app/api/stripe/webhook/route.ts", "app/api/withdrawals/route.ts"]) {
  const text = read(file);
  assert(!text.includes("stripe.refunds.create") && !text.includes("refunds.create("), `${file} must not execute Stripe refunds`);
}
console.log("no refund provider execution checks passed");