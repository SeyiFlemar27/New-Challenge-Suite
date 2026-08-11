import assert from "node:assert/strict";
import { read } from "./production-flow-test-utils.mjs";
const route = read("app/api/withdrawals/route.ts");
assert(!route.includes("KYC_REQUIRED"));
assert(!route.includes('String(kyc.kycStatus) !== "verified"'));
assert(route.includes("createWithdrawalRequest") && route.includes("Withdrawal request submitted for review."));
console.log("withdrawal request KYC-free checks passed");
