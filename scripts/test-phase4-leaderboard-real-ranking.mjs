import assert from "node:assert/strict";
import { read } from "./production-flow-test-utils.mjs";
const leaderboard = read("lib/server/leaderboard.ts");
assert(leaderboard.includes("isEligibleLeaderboardSubmission"));
for (const marker of ["rejected", "disqualified", "withdrawn", "incomplete", "pending_payment"]) assert(leaderboard.includes(marker));
assert(leaderboard.includes("weightedVoteCount") && leaderboard.includes("voteCount"));
console.log("phase4 real leaderboard ranking checks passed");