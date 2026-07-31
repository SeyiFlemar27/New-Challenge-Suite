import assert from "node:assert/strict";
import { read } from "./production-flow-test-utils.mjs";
const route = read("app/api/withdrawals/route.ts");
assert(route.includes('kyc.kycStatus') && route.includes("KYC_REQUIRED"));
assert(route.includes('String(kyc.kycStatus) !== "verified"'));
assert(route.indexOf('String(kyc.kycStatus) !== "verified"') < route.lastIndexOf("createWithdrawalRequest"));
console.log("withdrawal KYC gate checks passed");
