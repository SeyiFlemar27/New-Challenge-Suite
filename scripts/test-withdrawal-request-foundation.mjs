import { readFileSync } from "node:fs";
import assert from "node:assert/strict";
const page = readFileSync("app/wallet/withdraw/page.tsx", "utf8");
const api = readFileSync("app/api/withdrawals/route.ts", "utf8");
const wallet = readFileSync("app/wallet/page.tsx", "utf8");
const service = readFileSync("lib/server/withdrawals.ts", "utf8");
assert(wallet.includes('>Withdraw<') || wallet.includes('Withdraw</'), "Wallet must show Withdraw action");
assert(page.includes('Bank Transfer'), "Withdraw page must include Bank Transfer");
assert(page.includes('PayPal'), "Withdraw page must include PayPal");
assert(!page.toLowerCase().includes('crypto'), "Withdraw page must not include crypto");
assert(page.includes('DoroCoins cannot be withdrawn'), "Withdraw page must keep DoroCoin safety copy");
assert(service.includes('pending_review'), "Withdrawal service must create pending review requests");
assert(api.includes('payoutExecuted: false'), "Withdrawal API must not execute payouts");
assert(!api.includes('stripe.refunds'), "Withdrawal API must not call refund APIs");
console.log("withdrawal request foundation checks passed");

