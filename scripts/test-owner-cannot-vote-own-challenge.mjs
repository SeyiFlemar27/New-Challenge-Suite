import assert from "node:assert/strict";
import { read } from "./production-flow-test-utils.mjs";
const voting = read("lib/server/voting.ts");
const participantsApi = read("app/api/challenges/[id]/participants/route.ts");
assert(voting.includes("CHALLENGE_OWNER_VOTING_BLOCKED"));
assert(voting.includes("challengeOwnerId === input.userId"));
assert(participantsApi.includes("userOwnsChallenge") && participantsApi.includes("owner_blocked"));
console.log("owner voting restriction checks passed");
