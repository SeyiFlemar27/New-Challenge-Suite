import assert from "node:assert/strict";
import { read } from "./production-flow-test-utils.mjs";

const voting = read("lib/server/voting.ts");
assert(voting.includes('freeVoteGuardId(input.userId, input.challengeId, voteDateKey)'));
assert(voting.includes("voteDateKeyForTimeZone(nowDate, voteTimeZone)"));
assert(voting.includes("You have used your free vote for this challenge today."));
console.log("local-day free vote checks passed");
