import assert from "node:assert/strict";
import { read } from "./production-flow-test-utils.mjs";
const voting = read("lib/server/voting.ts");
const route = read("app/api/votes/route.ts");
assert(voting.includes("SPONSOR_ACCOUNT_BLOCKED"));
assert(voting.includes("CHALLENGE_OWNER_VOTING_BLOCKED"));
assert(route.includes("CHALLENGE_OWNER_VOTING_BLOCKED"));
console.log("phase4 owner and sponsor voting guardrail checks passed");