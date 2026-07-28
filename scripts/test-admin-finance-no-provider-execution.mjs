import assert from "node:assert/strict";
import { read } from "./production-flow-test-utils.mjs";
const adminOps = read("app/api/admin/operations/route.ts");
const withdrawals = read("lib/server/withdrawals.ts");
assert(adminOps.includes("moneyMovementEnabled: false") || adminOps.includes("payoutProviderCalled: false") || adminOps.includes("automaticPayouts"), "admin finance must disclose no money movement execution");
assert(withdrawals.includes("automaticPayoutsEnabled()") && withdrawals.includes("return false"), "automatic payouts must remain disabled");
assert(!adminOps.includes("stripe.payouts.create") && !adminOps.includes("stripe.refunds.create"), "admin finance must not call provider payout/refund APIs");
console.log("admin finance no provider execution checks passed");