import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
const files = ["app/earnings/page.tsx", "app/earnings/transactions/page.tsx", "app/admin/finance/page.tsx", "lib/server/financial/sponsorship-flow.ts"].map((file) => readFileSync(join(process.cwd(), file), "utf8")).join("\n");
assert(files.includes("No demo rows") && files.includes("No fake balances"), "Financial UI must use empty states instead of fake money.");
assert(!/mockTransactions|payout receipt generated|sponsor funding confirmed for demo|winner earnings credited/i.test(files), "Financial foundation must not include mock money rows.");
assert(files.includes("DoroCoins are not cash"), "Virtual wallet and real earnings separation must be visible.");
console.log("Financial no-mock money checks passed.");
