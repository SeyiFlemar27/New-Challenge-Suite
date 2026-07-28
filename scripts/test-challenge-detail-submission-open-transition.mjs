import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
const detail = readFileSync("app/challenges/[id]/page.tsx", "utf8");
const journey = readFileSync("lib/server/participant-journey.ts", "utf8");
assert(journey.includes("wait_for_submission") && journey.includes("Submissions open at"), "entered waiting state must show submission-open time");
assert(journey.includes("phase.canSubmit") && journey.includes('"submit_entry"'), "submission readiness must use canSubmit boolean and route to submit action");
assert(detail.includes("window.setTimeout") && detail.includes("entered_waiting_submission") && detail.includes("refetch()"), "detail page must refetch when submission open time arrives");
assert(detail.includes('href={`/challenges/${challengeId}/join`}'), "Submit Entry action must route to join/submission page");
console.log("challenge detail submission-open transition checks passed");
