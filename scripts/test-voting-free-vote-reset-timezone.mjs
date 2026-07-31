import assert from "node:assert/strict";
import { read } from "./production-flow-test-utils.mjs";

const voting = read("lib/server/voting.ts");
const api = read("app/api/challenges/[id]/route.ts");
assert(voting.includes("nextVoteResetAt") && voting.includes("timeZone: voteTimeZone") && voting.includes("resetsAt: freeVoteResetAt"));
assert(api.includes("requestProfile.timeZone") && api.includes("freeVoteGuardSnap") && api.includes("resetsAt: nextVoteResetAt"));
console.log("free vote timezone reset checks passed");
