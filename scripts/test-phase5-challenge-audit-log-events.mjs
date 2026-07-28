import assert from "node:assert/strict";
import { read } from "./production-flow-test-utils.mjs";
const source = read(
"app/api/challenges/[id]/manage/route.ts"
);
assert(source.includes("writeAuditLog"), "missing " + "writeAuditLog");
assert(source.includes("auditLogs"), "missing " + "auditLogs");
assert(source.includes("challengeId"), "missing " + "challengeId");
console.log("test-phase5-challenge-audit-log-events checks passed");
