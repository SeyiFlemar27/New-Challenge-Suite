import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
const detail = readFileSync("app/challenges/[id]/page.tsx", "utf8");
const journey = readFileSync("lib/server/participant-journey.ts", "utf8");
assert(journey.includes("submissionOpensAt") && journey.includes("submissionDeadline") && journey.includes("timelineNeedsReview"), "journey checklist must expose submission timing metadata");
assert(detail.includes("submissionChecklistLabel") && detail.includes("Opens ${formatChallengeDateTime") && detail.includes('return "Closed"'), "detail checklist must distinguish opens/open/closed labels with the shared timezone formatter");
assert(!detail.includes('["Submission", checklist.submissionOpen ? "Open" : "Closed"]'), "before-open submission must not be rendered as closed");
console.log("participant checklist submission label checks passed");
