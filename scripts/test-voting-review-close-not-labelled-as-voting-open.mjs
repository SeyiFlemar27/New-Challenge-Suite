import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const page = readFileSync("app/challenges/[id]/page.tsx", "utf8");
const status = readFileSync("lib/challenge-status.ts", "utf8");
assert(!page.includes("`Voting opens ${formatChallengeDateTime(phaseSummary?.votingStartAt"));
assert(status.includes('return result("Voting / Review Open", "Voting/review closes", timeline.votingClosesAt)'));
assert(status.includes('"Voting/review closes"'));
console.log("voting/review closing label checks passed");
