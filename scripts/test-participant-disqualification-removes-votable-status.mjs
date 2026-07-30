import assert from "node:assert/strict";
import { read } from "./production-flow-test-utils.mjs";
const manage = read("app/api/challenges/[id]/manage/route.ts");
const leaderboard = read("lib/server/leaderboard.ts");
assert(manage.includes('disqualify: "disqualified"'));
assert(leaderboard.includes('"disqualified"') && leaderboard.includes("return false"));
console.log("participant disqualification voting eligibility checks passed");
