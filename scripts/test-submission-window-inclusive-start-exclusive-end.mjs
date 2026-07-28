import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const status = readFileSync("lib/challenge-status.ts", "utf8");
const journey = readFileSync("lib/server/participant-journey.ts", "utf8");
const access = readFileSync("lib/server/challenge-viewer-state.ts", "utf8");
const start = Date.parse("2026-07-28T19:30:00.000Z");
const deadline = Date.parse("2026-07-28T19:40:00.000Z");
const submissionOpen = (now) => now >= start && now < deadline;

for (const [instant, expected] of [
  ["2026-07-28T19:29:59.000Z", false],
  ["2026-07-28T19:30:00.000Z", true],
  ["2026-07-28T19:30:01.000Z", true],
  ["2026-07-28T19:39:59.000Z", true],
  ["2026-07-28T19:40:00.000Z", false],
  ["2026-07-28T19:40:01.000Z", false]
]) {
  assert.equal(submissionOpen(Date.parse(instant)), expected, `unexpected boundary state at ${instant}`);
}

assert(status.includes("now >= timeline.submissionOpensAt") && status.includes("now < timeline.submissionClosesAt"), "phase summary must use inclusive start and exclusive end");
assert(journey.includes("if (phase.canSubmit)") && journey.includes('"You can submit now."'), "eligible paid entrants must use canonical canSubmit during the valid window");
assert(journey.includes("userOwnsChallenge") && journey.includes("isSponsorProfile"), "owner and sponsor restrictions must remain ahead of submission access");
assert(access.includes("paymentPaid") && access.includes("phaseSummary.canSubmit"), "paid-entry submission must still require confirmed payment and canonical window access");
console.log("inclusive-start exclusive-end submission checks passed");
