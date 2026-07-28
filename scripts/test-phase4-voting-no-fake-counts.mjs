import assert from "node:assert/strict";
import { read } from "./production-flow-test-utils.mjs";
const leaderboard = read("lib/server/leaderboard.ts");
const voting = read("lib/server/voting.ts");
assert(leaderboard.includes('db.collection("submissions")'));
assert(voting.includes("transaction.set(submissionRef") && voting.includes("transaction.set(challengeRef"));
for (const marker of ["mockVotes", "fakeVoteCount", "demoVoteCount"]) assert(!leaderboard.includes(marker) && !voting.includes(marker));
console.log("phase4 no fake vote count checks passed");