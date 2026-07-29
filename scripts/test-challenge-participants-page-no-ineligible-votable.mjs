import assert from "node:assert/strict";
import { read } from "./production-flow-test-utils.mjs";
const leaderboard = read("lib/server/leaderboard.ts");
const voting = read("lib/server/voting.ts");
assert(leaderboard.includes("isEligibleLeaderboardSubmission"));
assert(leaderboard.includes("canSubmissionReceiveVotes"));
assert(voting.includes("canSubmissionReceiveVotes(submission.status)"));
assert(voting.includes("SUBMISSION_NOT_VOTABLE"));
console.log("ineligible public voting target checks passed");
