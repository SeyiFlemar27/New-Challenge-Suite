import assert from "node:assert/strict";
import { read } from "./production-flow-test-utils.mjs";

const page = read("app/challenges/[id]/page.tsx");
assert(page.includes('role="tablist"') && page.includes('role="tabpanel"'));
for (const label of ["Overview", "Rules & Eligibility", "Submission", "Voting & Judging", "Prizes", "Leaderboard"]) assert(page.includes(label), label);
assert(!page.includes("<details open"));
console.log("challenge guide tab checks passed");
