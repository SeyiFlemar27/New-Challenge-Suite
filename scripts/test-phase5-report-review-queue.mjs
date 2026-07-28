import assert from "node:assert/strict";
import { read } from "./production-flow-test-utils.mjs";
const source = read(
"app/api/challenges/[id]/manage/route.ts"
);
assert(source.includes("challengeReports"), "missing " + "challengeReports");
assert(source.includes("under_review"), "missing " + "under_review");
assert(source.includes("resolved"), "missing " + "resolved");
assert(source.includes("dismissed"), "missing " + "dismissed");
assert(source.includes("escalated"), "missing " + "escalated");
console.log("test-phase5-report-review-queue checks passed");
