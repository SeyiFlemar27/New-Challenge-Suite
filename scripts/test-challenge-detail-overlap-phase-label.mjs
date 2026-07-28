import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const phase = readFileSync("lib/challenge-status.ts", "utf8");
const journey = readFileSync("lib/server/participant-journey.ts", "utf8");

assert(phase.includes('registrationOpen && submissionOpen'), "overlapping registration and submission windows must be detected");
assert(phase.includes('"Registration & Submission Open"'), "overlap must have a clear public label");
assert(phase.includes("now >= timeline.submissionOpensAt") && phase.includes("now <= timeline.submissionClosesAt"), "submission window must be time-based");
assert(journey.includes("if (phase.canSubmit)"), "participant journey must use canSubmit boolean during overlap");
console.log("challenge detail overlap phase label checks passed");
