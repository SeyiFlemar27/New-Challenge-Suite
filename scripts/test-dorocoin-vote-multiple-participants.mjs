import assert from "node:assert/strict";
import { read } from "./production-flow-test-utils.mjs";

const page = read("app/challenges/[id]/bonus-votes/page.tsx");
const voting = read("lib/server/voting.ts");
assert(page.includes("Vote For Submission") && page.includes("setSubmissionId"));
assert(voting.includes("submissionId: input.submissionId"));
assert(!voting.includes("one DoroCoin target per challenge"));
console.log("DoroCoin multi-participant distribution checks passed");
