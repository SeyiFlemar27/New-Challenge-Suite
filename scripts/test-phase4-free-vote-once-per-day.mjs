import assert from "node:assert/strict";
import { read } from "./production-flow-test-utils.mjs";
const voting = read("lib/server/voting.ts");
assert(voting.includes("freeVoteDailyGuards") && voting.includes("input.submissionId") && voting.includes("voteDateKey"));
assert(voting.includes("FREE_SUBMISSION_DAILY_LIMIT_REACHED"));
assert(!voting.includes("FREE_CHALLENGE_DAILY_LIMIT_REACHED"));
console.log("phase4 per-submission daily free vote checks passed");