import assert from "node:assert/strict";
import { read } from "./production-flow-test-utils.mjs";
const voting = read("lib/server/voting.ts");
const status = read("lib/challenge-status.ts");
assert(voting.includes("canVoteOnChallenge") || voting.includes("getChallengeLifecycleState"), "voting helper must enforce challenge voting window");
assert(status.includes("voting_not_open") && status.includes("voting_closed"), "challenge status must expose voting window closed/not-open states");
console.log("voting window guardrail checks passed");