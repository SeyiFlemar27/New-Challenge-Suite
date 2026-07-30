import assert from "node:assert/strict";
import { read } from "./production-flow-test-utils.mjs";
const route = read("app/api/admin/operations/route.ts");
assert(route.includes("writeAuditLog"));
assert(route.includes("previousStatus") && route.includes("newStatus"));
console.log("admin withdrawal audit checks passed");
