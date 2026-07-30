import assert from "node:assert/strict";
import { read } from "./production-flow-test-utils.mjs";
const route = read("app/api/admin/operations/route.ts");
assert(route.includes("approved_for_manual_payout") && route.includes("mark_paid"));
assert(route.includes("externalPayoutExecuted: false") && route.includes("transferEnabled: false"));
assert(!route.includes("stripe.transfers.create") && !route.includes("stripe.payouts.create"));
console.log("admin withdrawal provider safety checks passed");
