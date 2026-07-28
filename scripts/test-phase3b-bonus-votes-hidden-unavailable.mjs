import assert from "node:assert/strict";
import { read } from "./production-flow-test-utils.mjs";
const bonus = read("app/challenges/[id]/bonus-votes/page.tsx");
assert(bonus.indexOf("if (!votingOpen)") < bonus.indexOf("Confirm DoroCoin Votes"));
assert(bonus.includes("No eligible submissions are available for bonus votes yet."));
console.log("Phase 3B bonus-vote unavailable checks passed.");
