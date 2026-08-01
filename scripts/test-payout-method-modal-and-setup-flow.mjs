import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const earnings = readFileSync("app/earnings/page.tsx", "utf8");
const api = readFileSync("app/api/payout-methods/route.ts", "utf8");
const withdrawals = readFileSync("app/api/withdrawals/route.ts", "utf8");

for (const label of ["Bank Transfer", "PayPal", "Payoneer"]) assert(earnings.includes(label), `payout selector must list ${label}`);
assert(earnings.includes('role="dialog"') && earnings.includes('aria-modal="true"'), "payout setup must use an accessible modal");
assert(earnings.includes("Escape"), "payout modal must support Escape");
assert(api.includes("requireRequestUser"), "payout method API must require authentication");
assert(api.includes('where("userId", "==", user.uid)'), "users may only list their own payout methods");
assert(api.includes("maskedAccount"), "payout setup must persist masked account details");
assert(api.includes("providerConnected: false") && api.includes("transferEnabled: false"), "setup must not claim provider connection");
assert(withdrawals.includes("PAYOUT_METHOD_NOT_OWNED"), "withdrawal must reject payout methods owned by another account");
console.log("payout method setup checks passed");
