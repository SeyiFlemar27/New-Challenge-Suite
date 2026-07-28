import assert from "node:assert/strict";
import { read } from "./production-flow-test-utils.mjs";
const notifications = read("lib/server/notifications.ts");
const audit = read("lib/server/audit.ts");
const flow = read("lib/server/challenge-production-flow.ts");
assert(notifications.includes("createNotification") && notifications.includes("idempotencyKey"), "notification helper must support idempotent in-app notifications");
assert(audit.includes("writeAuditLog") && audit.includes("auditLogs"), "audit helper must write audit logs");
assert(flow.includes("WINNERS_ANNOUNCED") && flow.includes("SETTLEMENT_REVIEW_REQUIRED"), "winner and settlement audit event foundations must exist");
console.log("winner notification and audit foundation checks passed");