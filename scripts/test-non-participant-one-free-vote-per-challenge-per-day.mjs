import assert from "node:assert/strict";
import { read } from "./production-flow-test-utils.mjs";
const voting = read("lib/server/voting.ts");
assert(voting.includes("freeVoteGuardId(input.userId, input.challengeId, voteDateKey)"));
assert(voting.includes("voteDateKeyForTimeZone(nowDate, voteTimeZone)"));
assert(!voting.includes('deterministicId("free_vote", input.userId, input.challengeId, input.submissionId, voteDateKey)'));
assert(voting.includes("You have used your free vote for this challenge today."));
assert(voting.includes("FREE_CHALLENGE_DAILY_LIMIT_REACHED"));
console.log("challenge-wide daily free vote checks passed");
