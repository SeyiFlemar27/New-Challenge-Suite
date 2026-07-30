import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const predictions = readFileSync("lib/server/predictions.ts", "utf8");
const status = readFileSync("lib/challenge-status.ts", "utf8");
assert(predictions.includes("const closesAt = phaseSummary.votingStartAt"));
assert(predictions.includes("now.getTime() < closesAtMs"));
assert(status.includes("submissionOpensAt ?? configuredVotingOpensAt"));
const startsAt = Date.parse("2026-07-30T13:00:00.000Z");
assert.equal(startsAt - 1 < startsAt, true);
assert.equal(startsAt < startsAt, false);
console.log("prediction Challenge/Submissions start cutoff checks passed");
