import assert from "node:assert/strict";
import { read } from "./production-flow-test-utils.mjs";
const challenge = read("app/api/challenges/[id]/manage/route.ts");
const operations = read("app/api/admin/operations/route.ts");
assert(challenge.includes("writeAuditLog") && operations.includes("writeAuditLog"));
assert(challenge.includes('"metadata.challengeId"'));
console.log("sensitive action audit checks passed");
