import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const detail = readFileSync("app/challenges/[id]/page.tsx", "utf8");
const join = readFileSync("app/challenges/[id]/join/page.tsx", "utf8");
const status = readFileSync("lib/challenge-status.ts", "utf8");
assert(detail.includes("submissionOpensAt={checklist.submissionOpensAt}"));
assert(join.includes("phaseSummary?.submissionStartAt"));
assert(join.includes("phaseSummary?.submissionDeadline"));
assert(status.includes('"Challenge/Submissions start", timeline.submissionOpensAt'));
assert(status.includes('"Submission deadline", timeline.submissionClosesAt'));
assert(status.includes('"Voting/review closes", timeline.votingClosesAt'));
assert(status.includes('"Winner announcement", timeline.winnersAnnouncedAt'));
console.log("canonical countdown target checks passed");
