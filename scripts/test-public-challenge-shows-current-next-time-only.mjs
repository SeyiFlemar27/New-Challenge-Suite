import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const page = readFileSync("app/challenges/[id]/page.tsx", "utf8");
const status = readFileSync("lib/challenge-status.ts", "utf8");
assert(page.includes("Current phase"));
assert(page.includes("Next important time"));
assert(!page.includes('<Info title="Timeline"'));
for (const label of ["Registration Open", "Waiting to Start", "Submissions Open", "Voting / Review Open", "Results Under Review", "Winners Announced"]) {
  assert(status.includes(`\"${label}\"`), `missing current phase ${label}`);
}
assert(status.includes("now >= timeline.submissionOpensAt && now < timeline.submissionClosesAt"));
console.log("public current/next timeline-only checks passed");
