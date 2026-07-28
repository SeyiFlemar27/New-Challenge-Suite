import assert from "node:assert/strict";
import { read } from "./production-flow-test-utils.mjs";
const source = read(
"app/api/challenges/[id]/manage/route.ts"
);
assert(source.includes("mark_incomplete"), "missing " + "mark_incomplete");
assert(source.includes("restore"), "missing " + "restore");
assert(source.includes("disqualify"), "missing " + "disqualify");
assert(source.includes("challengeParticipants"), "missing " + "challengeParticipants");
console.log("test-phase5-participant-management-actions checks passed");
