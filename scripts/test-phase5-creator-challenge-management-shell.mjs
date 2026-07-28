import assert from "node:assert/strict";
import { read } from "./production-flow-test-utils.mjs";
const source = read(
"app/challenges/[id]/manage/page.tsx"
);
assert(source.includes("Challenge Management"), "missing " + "Challenge Management");
assert(source.includes("Participants"), "missing " + "Participants");
assert(source.includes("Entry Requests"), "missing " + "Entry Requests");
assert(source.includes("Submissions"), "missing " + "Submissions");
assert(source.includes("Voting"), "missing " + "Voting");
assert(source.includes("Reports"), "missing " + "Reports");
assert(source.includes("Winners"), "missing " + "Winners");
assert(source.includes("Timeline"), "missing " + "Timeline");
assert(source.includes("Settings"), "missing " + "Settings");
assert(source.includes("Settlement"), "missing " + "Settlement");
assert(source.includes("Audit Log"), "missing " + "Audit Log");
console.log("test-phase5-creator-challenge-management-shell checks passed");
