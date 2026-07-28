import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
const entryRequests = readFileSync("app/challenges/[id]/entry-requests/page.tsx", "utf8");
const finance = readFileSync("app/admin/finance/page.tsx", "utf8");
const sponsor = readFileSync("app/sponsor/dashboard/page.tsx", "utf8");
assert(entryRequests.includes("No entry requests yet"), "entry requests must have a clean empty state");
assert(finance.includes("No finance review items") || finance.includes("No finance records yet"), "admin finance must have a clean empty state");
assert(sponsor.includes("Not tracked yet"), "sponsor metrics must use real/not tracked state");
console.log("real data empty state checks passed");
