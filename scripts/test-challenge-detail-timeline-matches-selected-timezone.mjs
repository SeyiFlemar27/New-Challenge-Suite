import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { formatChallengeDateTime } from "../lib/challenge-date-time.ts";

const page = readFileSync("app/challenges/[id]/page.tsx", "utf8");
assert(page.includes("getChallengeTimelineDisplay"));
assert(page.includes("timelineDisplay.timeZone"));
assert(page.includes("Next important time"));
assert.equal(formatChallengeDateTime("2026-07-30T13:00:00.000Z", "America/New_York"), "Jul 30, 9:00 AM ET");
assert.equal(formatChallengeDateTime("2026-07-30T08:00:00.000Z", "Africa/Lagos"), "Jul 30, 9:00 AM WAT");
console.log("challenge detail selected-timezone checks passed");
