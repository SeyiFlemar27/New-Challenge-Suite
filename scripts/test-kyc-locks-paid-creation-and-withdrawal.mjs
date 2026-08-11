import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const withdrawal = readFileSync("app/api/withdrawals/route.ts", "utf8");
const policy = readFileSync("lib/server/kyc-policy.ts", "utf8");
const builder = readFileSync("components/challenge-builder.tsx", "utf8");

assert(!withdrawal.includes("KYC verification is required before withdrawals."), "withdrawals must not remain KYC locked");
assert(policy.includes("paidChallengePublishing: false") && policy.includes("withdrawalRequest: false"), "paid publishing and withdrawal requests must be KYC-free");
assert(!builder.includes("KYC is required before withdrawals"), "builder must not present KYC as a blocker");
assert(!withdrawal.includes("payoutExecuted: true"), "KYC completion must not execute payout");
console.log("KYC-free action checks passed");
