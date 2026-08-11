import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const route = readFileSync("app/api/withdrawals/route.ts", "utf8");
const service = readFileSync("lib/server/withdrawals.ts", "utf8");
const page = readFileSync("app/wallet/withdraw/page.tsx", "utf8");

assert(!route.includes('String(kyc.kycStatus) !== "verified"'), "withdrawal request must not require verified KYC");
assert(route.includes("source.userId !== user.uid"), "withdrawal source must belong to the requester");
assert(route.includes("source.status !== \"available\""), "withdrawal source must be available");
assert(route.includes("WITHDRAWAL_SOURCE_AMOUNT_MISMATCH"), "withdrawal must not exceed or partially rewrite a source");
assert(service.includes("db.runTransaction") || route.includes("db.runTransaction"), "withdrawal reservation must be transactional");
assert(service.includes("availableBalanceCents: after"), "withdrawal must reserve available balance");
assert(service.includes('status: "withdrawal_requested"'), "source ledger must be reserved");
assert(service.includes("payoutExecuted: false"), "withdrawal request must not execute payout");
assert(page.includes("Saved payout method"), "withdrawal UI must accept an owned saved payout method");
console.log("withdrawal ledger reservation checks passed");
