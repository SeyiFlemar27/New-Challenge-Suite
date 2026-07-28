import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const journey = readFileSync("lib/server/participant-journey.ts", "utf8");
const detail = readFileSync("app/challenges/[id]/page.tsx", "utf8");
const join = readFileSync("app/challenges/[id]/join/page.tsx", "utf8");

assert(journey.includes("formatChallengeDateTime(phase.submissionStartAt, phase.timeZone)"), "journey message must use canonical submissionStartAt and timezone");
assert(journey.includes("submissionOpensAt: input.phaseSummary.submissionStartAt"), "checklist must retain canonical submissionStartAt");
assert(detail.includes("formatChallengeDateTime(checklist.submissionOpensAt, timeZone)"), "passive CTA and checklist must share canonical formatter");
assert(detail.includes("formatChallengeDateTime(phaseSummary?.submissionStartAt, challengeTimeZone)"), "challenge guide must use canonical timeline time");
assert(join.includes("formatChallengeDateTime(phaseSummary?.submissionStartAt, challengeTimeZone)"), "join page must use canonical timeline time");
assert(!journey.includes("toLocaleString(undefined"), "server journey must not use server-local timezone formatting");
console.log("challenge submission time consistency checks passed");
