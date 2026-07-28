import assert from "node:assert/strict";
import { read } from "./production-flow-test-utils.mjs";
const status = read("lib/challenge-status.ts");
const page = read("app/challenges/[id]/votes/page.tsx");
assert(status.includes("voting_open") && status.includes("voting_closed"));
assert(page.includes("Voting is not open") && page.includes("Voting unavailable"));
console.log("phase4 voting open/close flow checks passed");