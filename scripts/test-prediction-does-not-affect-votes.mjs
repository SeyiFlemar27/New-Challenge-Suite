import assert from "node:assert/strict";
import { read } from "./production-flow-test-utils.mjs";

const helper = read("lib/server/predictions.ts");
const settlement = read("lib/server/prediction-settlement.ts");
assert(helper.includes("affectsVotes: false"));
assert(helper.includes("affectsLeaderboard: false"));
assert(helper.includes("affectsWinnerSelection: false"));
assert(!helper.includes('collection("votes")'));
assert(!helper.includes('collection("challengeParticipants")'));
assert(!helper.includes('collection("submissions")'));
assert(!settlement.includes('collection("votes")'));
assert(!settlement.includes("voteCount"));
console.log("prediction voting and participant non-interference checks passed");
