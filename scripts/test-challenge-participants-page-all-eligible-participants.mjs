import assert from "node:assert/strict";
import { read } from "./production-flow-test-utils.mjs";
const helper = read("lib/server/challenge-participants.ts");
const leaderboard = read("lib/server/leaderboard.ts");
assert(helper.includes("buildChallengeLeaderboard"));
for (const status of ["rejected", "withdrawn", "disqualified", "incomplete", "pending_payment"]) {
  assert(leaderboard.includes(status));
}
assert(leaderboard.includes("paidEntryRequired") && leaderboard.includes('"paid", "confirmed"'));
console.log("participants eligibility checks passed");
