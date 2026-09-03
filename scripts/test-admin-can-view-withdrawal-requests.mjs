import assert from "node:assert/strict";
import { read } from "./production-flow-test-utils.mjs";
const route = read("app/api/admin/operations/route.ts");
const ui = read("components/admin/admin-control-center.tsx");
assert(route.includes('permittedSnapshot(db, permissions, "withdrawals.review", "withdrawalRequests"'));
assert(ui.includes("Withdrawal Review") && ui.includes("First approval") && ui.includes("Second approval") && ui.includes("Mark paid manually"));
console.log("admin withdrawal review visibility checks passed");
