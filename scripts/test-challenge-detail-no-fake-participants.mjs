import assert from "node:assert/strict";
import { read } from "./production-flow-test-utils.mjs";
const page = read("app/challenges/[id]/page.tsx");
const helper = read("lib/server/challenge-participants.ts");
assert(page.includes("topParticipants"));
assert(helper.includes("buildChallengeLeaderboard"));
assert(!page.includes("mockParticipants") && !helper.includes("mockParticipants"));
assert(!helper.includes("fakeVote") && !helper.includes("Math.random"));
console.log("challenge detail real participant data checks passed");
