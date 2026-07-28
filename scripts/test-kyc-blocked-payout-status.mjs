import assert from "node:assert/strict";
import { read } from "./production-flow-test-utils.mjs";
const withdrawApi = read("app/api/withdrawals/route.ts");
const walletArch = read("lib/server/wallet-architecture.ts");
const prize = read("lib/server/prize-approvals.ts");
assert(withdrawApi.includes("KYC_REQUIRED") && withdrawApi.includes("loadKycMetadata"), "withdrawal route must require KYC before withdrawal request approval path");
assert(walletArch.includes("blocked_kyc") && walletArch.includes("kyc_required"), "wallet states must represent KYC-blocked earnings");
assert(prize.includes("kycRequiredBeforeWithdrawal: true"), "winner ledger foundation must keep KYC required before withdrawal");
console.log("KYC blocked payout status checks passed");