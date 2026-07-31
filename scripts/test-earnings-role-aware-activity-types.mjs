import assert from "node:assert/strict";
import { read } from "./production-flow-test-utils.mjs";
const source = read("app/earnings/page.tsx");
for (const text of ["Sponsored challenge spending", "Creator and challenge earnings", "Challenge prizes and rewards"]) assert(source.includes(text));
for (const type of ["challenge_winner_prize", "sponsor_prize", "creator_challenge_earning", "prediction_reward"]) assert(source.includes(type));
console.log("role-aware earnings activity checks passed");
