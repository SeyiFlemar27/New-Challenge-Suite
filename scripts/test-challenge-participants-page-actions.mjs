import assert from "node:assert/strict";
import { read } from "./production-flow-test-utils.mjs";
const card = read("components/challenge-participant-card.tsx");
assert(card.includes("profilePath"));
assert(card.includes("View Submission"));
assert(card.includes("voteForSubmission"));
assert(card.includes("Log in to Vote"));
assert(!card.includes("Predict Winner"));
console.log("participants page action checks passed");
