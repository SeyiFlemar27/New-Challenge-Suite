import assert from "node:assert/strict";
import { read } from "./production-flow-test-utils.mjs";

const page = read("app/challenges/[id]/page.tsx");
assert(page.includes("leaderboardRelevant"));
assert(page.includes("Leaderboard becomes available when voting opens."));
assert(page.includes("{leaderboardRelevant ? ("));
console.log("challenge detail leaderboard visibility checks passed");
