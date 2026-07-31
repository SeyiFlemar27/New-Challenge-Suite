import assert from "node:assert/strict";
import { read } from "./production-flow-test-utils.mjs";
const source = read("app/earnings/page.tsx");
for (const text of ["Overview", "Transactions", "Payouts", "Financial Documents", "Available Funds", "Future Payments", "Earnings & Expenses"]) assert(source.includes(text));
assert(source.includes("statusFilter") && source.includes("sourceFilter"));
console.log("earnings financial layout checks passed");
