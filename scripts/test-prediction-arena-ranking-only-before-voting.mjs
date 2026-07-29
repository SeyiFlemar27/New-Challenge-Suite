import assert from "node:assert/strict";
import { read } from "./production-flow-test-utils.mjs";

const helper = read("lib/server/challenge-participants.ts");
const page = read("app/challenges/[id]/prediction/page.tsx");
assert(helper.includes("predictionWindowState"));
assert(helper.includes("exactVoteCountVisible = leaderboard.visible && !predictionRankingOnly"));
assert(page.includes("Rankings are shown while Prediction Arena is open"));
assert(!page.includes("participant.voteCount"));
console.log("prediction ranking-only checks passed");
