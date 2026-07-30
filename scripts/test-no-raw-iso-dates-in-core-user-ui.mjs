import assert from "node:assert/strict";
import { read } from "./production-flow-test-utils.mjs";

const detail = read("app/challenges/[id]/page.tsx");
const join = read("app/challenges/[id]/join/page.tsx");
const builder = read("components/challenge-builder.tsx");
assert(detail.includes("formatChallengeDateTime"));
assert(join.includes("formatChallengeDateTime"));
assert(builder.includes("formatChallengeLocalDateTime"));
assert(!detail.includes("{challenge.submissionStartAt}"));
assert(!join.includes("{challenge.submissionDeadline}"));
console.log("Core lifecycle date formatting checks passed.");
