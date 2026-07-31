import assert from "node:assert/strict";
import { read } from "./production-flow-test-utils.mjs";
const route = read("app/api/withdrawals/route.ts");
const page = read("app/wallet/withdraw/page.tsx");
for (const method of ["bank_transfer", "paypal", "payoneer"]) assert(route.includes(method) && page.includes(method));
assert(route.includes("payoutExecuted: false") || read("lib/server/withdrawals.ts").includes("payoutExecuted: false"));
console.log("payout method checks passed");
