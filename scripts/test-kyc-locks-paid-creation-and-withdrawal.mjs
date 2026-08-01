import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const withdrawal = readFileSync("app/api/withdrawals/route.ts", "utf8");
const validation = readFileSync("lib/server/challenge-validation.ts", "utf8");
const builder = readFileSync("components/challenge-builder.tsx", "utf8");

assert(withdrawal.includes("KYC verification is required before withdrawals."), "withdrawals must remain KYC locked");
assert(/kyc/i.test(validation) || /kyc/i.test(builder), "paid challenge creation must retain a KYC validation path");
assert(!withdrawal.includes("kycStatus = \"verified\""), "withdrawal route must not force KYC approval");
assert(!withdrawal.includes("payoutExecuted: true"), "KYC completion must not execute payout");
console.log("KYC lock checks passed");
