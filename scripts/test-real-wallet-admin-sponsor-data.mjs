import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
const wallet = readFileSync("lib/server/wallet-architecture.ts", "utf8");
const admin = readFileSync("app/admin/finance/page.tsx", "utf8");
const sponsor = readFileSync("app/sponsor/dashboard/page.tsx", "utf8");
assert(wallet.includes("blocked_kyc") && wallet.includes("withdrawal_requested"), "wallet state buckets must distinguish blocked and withdrawal states");
assert(admin.includes("Finance Review"), "admin finance UI must use production label");
assert(sponsor.includes("Not tracked yet"), "sponsor dashboard must not show fake metrics");
console.log("real wallet admin sponsor data checks passed");
