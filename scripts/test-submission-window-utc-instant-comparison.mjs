import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const status = readFileSync("lib/challenge-status.ts", "utf8");
const join = readFileSync("app/challenges/[id]/join/page.tsx", "utf8");

assert(status.includes("now >= timeline.submissionOpensAt") && status.includes("now < timeline.submissionClosesAt"), "canonical window must be half-open at UTC instants");
assert(status.includes("if (closesAt && now >= closesAt) return \"submissions_closed\""), "exact deadline must be closed");
assert(join.includes("Date.parse(phaseSummary.submissionStartAt)") && join.includes("Date.parse(phaseSummary.submissionDeadline)"), "join timers must parse canonical ISO instants");
assert(!join.includes("Date.parse(formatChallengeDateTime"), "display text must not drive lifecycle comparison");

const submissionStartAt = Date.parse("2026-07-28T19:30:00.000Z"); // 8:30 PM WAT
const submissionDeadline = Date.parse("2026-07-28T19:40:00.000Z"); // 8:40 PM WAT
const submissionOpen = (instant) => instant >= submissionStartAt && instant < submissionDeadline;
assert.equal(submissionOpen(Date.parse("2026-07-28T19:29:00.000Z")), false, "8:29 PM WAT must remain closed");
assert.equal(submissionOpen(Date.parse("2026-07-28T19:30:00.000Z")), true, "8:30 PM WAT exact start must be open");
assert.equal(submissionOpen(Date.parse("2026-07-28T19:32:00.000Z")), true, "8:32 PM WAT must be open");
assert.equal(submissionOpen(Date.parse("2026-07-28T19:40:00.000Z")), false, "8:40 PM WAT exact deadline must be closed");
assert.equal(submissionOpen(Date.parse("2026-07-28T19:41:00.000Z")), false, "8:41 PM WAT must remain closed");
console.log("UTC instant submission-window checks passed");
