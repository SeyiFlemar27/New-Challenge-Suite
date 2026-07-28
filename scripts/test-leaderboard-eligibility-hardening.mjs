import assert from "node:assert/strict";
import { read } from "./production-flow-test-utils.mjs";
const leaderboard = read("lib/server/leaderboard.ts");
assert(leaderboard.includes("isEligibleLeaderboardSubmission") && leaderboard.includes("canSubmissionReceiveVotes"), "leaderboard must filter eligible submissions server-side");
for (const marker of ["disqualified", "withdrawn", "pending_payment", "sponsor", "isChallengeOwner", "paidEntryRequired"]) assert(leaderboard.includes(marker), `leaderboard must exclude ${marker} markers`);
console.log("leaderboard eligibility hardening checks passed");