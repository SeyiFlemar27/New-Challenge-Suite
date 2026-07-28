import assert from "node:assert/strict";
import { read } from "./production-flow-test-utils.mjs";
const source = read(
"app/api/challenges/[id]/manage/route.ts"
);
assert(source.includes("approve"), "missing " + "approve");
assert(source.includes("reject"), "missing " + "reject");
assert(source.includes("request_changes"), "missing " + "request_changes");
assert(source.includes("flag"), "missing " + "flag");
assert(source.includes("disqualify"), "missing " + "disqualify");
console.log("test-phase5-submission-moderation-flow checks passed");
