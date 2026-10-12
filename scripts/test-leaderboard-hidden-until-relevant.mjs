import assert from "node:assert/strict";
import { read } from "./production-flow-test-utils.mjs";

const page = read("app/challenges/[id]/page.tsx");
assert(page.includes("leaderboardRelevant"));
assert(page.includes("Audience rankings are not available yet."));
assert(page.includes("leaderboardRelevant && topParticipants.length > 0"));
console.log("challenge detail leaderboard visibility checks passed");
