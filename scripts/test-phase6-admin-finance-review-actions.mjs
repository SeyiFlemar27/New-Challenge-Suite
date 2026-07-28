import assert from "node:assert/strict";
import { read } from "./production-flow-test-utils.mjs";
const source = read(
"app/api/admin/operations/route.ts"
);
assert(source.includes("withdrawal: new Set([\"approve\", \"reject\", \"request_info\", \"add_note\"])"), "missing " + "withdrawal: new Set([\"approve\", \"reject\", \"request_info\", \"add_note\"])");
assert(source.includes("payoutExecuted: false"), "missing " + "payoutExecuted: false");
assert(source.includes("transferEnabled: false"), "missing " + "transferEnabled: false");
console.log("test-phase6-admin-finance-review-actions checks passed");
