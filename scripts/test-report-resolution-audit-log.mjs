import assert from "node:assert/strict";
import { read } from "./production-flow-test-utils.mjs";
const route = read("app/api/challenges/[id]/manage/route.ts");
assert(route.includes('report: { request_review: "pending_admin_review", review: "under_review", resolve: "resolved"'));
assert(route.includes("writeAuditLog") && route.includes("metadata: { challengeId: id }"));
console.log("report resolution audit checks passed");
