import assert from "node:assert/strict";
import { read } from "./production-flow-test-utils.mjs";

const source = read("lib/server/predictions.ts");
const votingStart = Date.parse("2026-07-28T20:00:00.000Z");
const open = (now) => now < votingStart;
assert.equal(open(votingStart - 1), true);
assert.equal(open(votingStart), false);
assert.equal(open(votingStart + 1), false);
assert(source.includes("phaseSummary.votingStartAt"));
assert(source.includes("now.getTime() < closesAtMs"));
assert(source.includes("exactVotingOpenTimeClosesPredictions: true"));
console.log("prediction voting-open cutoff checks passed");
