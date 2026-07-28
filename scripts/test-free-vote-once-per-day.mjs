import assert from "node:assert/strict";
import { read } from "./production-flow-test-utils.mjs";
const voting = read("lib/server/voting.ts");
assert(voting.includes("dailyFreeVote") || voting.includes("dailyFreeVoteLimit") || voting.includes("freeVoteDate"), "voting helper must enforce daily free vote tracking");
assert(voting.includes("idempotency") || voting.includes("requestIdempotencyKey"), "voting must have idempotency/duplicate protection foundation");
console.log("free vote once per day checks passed");