import assert from "node:assert/strict";
import { read } from "./production-flow-test-utils.mjs";

const publicPredictionUi = [
  "app/prediction-arena/page.tsx",
  "app/challenges/[id]/prediction/page.tsx"
].map(read).join("\n");

assert(publicPredictionUi.includes("Prediction Arena"));
assert(!/\b(?:bet|betting|gambl(?:e|ing)|casino|wager)\b/i.test(publicPredictionUi));
console.log("Prediction Arena public-copy checks passed.");
