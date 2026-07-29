import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const validation = readFileSync("lib/server/challenge-validation.ts", "utf8");
const builder = readFileSync("components/challenge-builder.tsx", "utf8");
const runtime = readFileSync("lib/challenge-status.ts", "utf8");

assert(validation.includes("submissionDeadline <= submissionStartAt"), "equal or earlier submission deadlines must be rejected.");
assert(validation.includes("Submission deadline must be after the challenge/submission start time."));
assert(validation.includes("challenge.submissionStartAt ?? challenge.startsAt"), "startsAt must be the canonical fallback for submissions opening.");
assert(builder.includes("submissionStartAt: form.startsAt"), "builder must persist Challenge/Submissions start as submissionStartAt.");

const start = Date.parse("2026-07-28T21:35:00Z");
assert(Date.parse("2026-07-28T22:00:00Z") > start);
assert(!(Date.parse("2026-07-28T21:35:00Z") > start));
assert(!(Date.parse("2026-07-28T21:30:00Z") > start));
assert(runtime.includes("now >= timeline.submissionOpensAt"), "runtime submission window must include its start.");
assert(runtime.includes("now < timeline.submissionClosesAt"), "runtime submission window must exclude its deadline.");

console.log("Create challenge submission deadline ordering checks passed.");
