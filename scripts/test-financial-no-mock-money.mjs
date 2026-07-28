import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
const files = ["app/earnings/page.tsx", "app/earnings/transactions/page.tsx", "app/admin/finance/page.tsx", "app/wallet/page.tsx", "lib/server/financial/sponsorship-flow.ts"].map((file) => readFileSync(join(process.cwd(), file), "utf8")).join("\n");
assert(files.includes("No finance review items") && files.includes("Sensitive payment and payout records will appear here when they require review."), "Financial UI must use production empty states instead of fake money.");
assert(!/mockTransactions|payout receipt generated|sponsor funding confirmed for demo|winner earnings credited/i.test(files), "Financial foundation must not include mock money rows.");
assert(files.includes("DoroCoins are not cash") || files.includes("DoroCoins are internal platform credits"), "Virtual wallet and real earnings separation must be visible.");
console.log("Financial no-mock money checks passed.");