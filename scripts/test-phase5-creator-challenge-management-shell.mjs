import assert from "node:assert/strict";
import { read } from "./production-flow-test-utils.mjs";
const source = read(
"app/challenges/[id]/manage/page.tsx"
);
assert(source.includes("Challenge Management"), "missing " + "Challenge Management");
assert(source.includes("Participants"), "missing " + "Participants");
assert(source.includes("Participant Requests"), "missing " + "Participant Requests");
assert(source.includes("Submissions"), "missing " + "Submissions");
assert(source.includes("Voting"), "missing " + "Voting");
assert(source.includes("Winners"), "missing " + "Winners");
assert(source.includes("Prize & Revenue"), "missing " + "Prize & Revenue");
assert(source.includes("Sponsors"), "missing " + "Sponsors");
assert(source.includes("Schedule"), "missing " + "Schedule");
console.log("test-phase5-creator-challenge-management-shell checks passed");
