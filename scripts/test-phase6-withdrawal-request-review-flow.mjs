import assert from "node:assert/strict";
import { read } from "./production-flow-test-utils.mjs";
const route = read("app/api/withdrawals/route.ts");
const service = read("lib/server/withdrawals.ts");
assert(route.includes("kycStatusAtRequest") && route.includes("bank_transfer") && route.includes("paypal"));
assert(route.includes("currentKycPolicyStatus()") && !route.includes("KYC_REQUIRED"));
assert(service.includes('status: "pending_review"') && service.includes("payoutExecuted: false"));
assert(route.includes("payoutExecuted: false"));
console.log("phase6 withdrawal request review flow checks passed");
