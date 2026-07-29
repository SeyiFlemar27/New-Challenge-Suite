import assert from "node:assert/strict";
import { read } from "./production-flow-test-utils.mjs";
const api = read("app/api/votes/route.ts");
const voting = read("lib/server/voting.ts");
assert(api.includes("requireRequestUser"));
assert(!api.includes('collection("challengeParticipants")'));
assert(!voting.includes('collection("challengeParticipants")'));
assert(voting.includes("canVoteOnChallenge") && voting.includes("canSubmissionReceiveVotes"));
console.log("non-participant voting access checks passed");
