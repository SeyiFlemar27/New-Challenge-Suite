import assert from "node:assert/strict";
import { read } from "./production-flow-test-utils.mjs";
const votes = read("app/api/votes/route.ts");
const leaderboard = read("lib/server/leaderboard.ts");
assert(!votes.includes("fake") && !votes.includes("mock"), "vote API must not create fake votes");
assert(leaderboard.includes("source: \"submissions\"") && !leaderboard.includes("fake"), "leaderboard must use submission source, not fake rows");
console.log("voting no fake counts checks passed");