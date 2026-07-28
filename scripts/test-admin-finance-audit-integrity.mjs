import assert from "node:assert/strict";
import { read } from "./production-flow-test-utils.mjs";
const adminOps = read("app/api/admin/operations/route.ts");
const audit = read("lib/server/audit.ts");
assert(adminOps.includes("auditLogs") && adminOps.includes("adminNote"), "admin review center must expose audit/admin-note context");
assert(audit.includes("writeAuditLog") && audit.includes("auditMetadata"), "shared audit helper must exist");
assert(!adminOps.includes("balanceOverwriteAllowed: true"), "admin finance must not allow raw balance overwrite");
console.log("admin finance audit integrity checks passed");