import assert from "node:assert/strict";
import { read } from "./production-flow-test-utils.mjs";

const publicSources = [
  read("app/challenges/[id]/prediction/page.tsx"),
  read("app/prediction-arena/page.tsx"),
  read("components/challenge-participant-card.tsx")
].join("\n").toLowerCase();
for (const term of [/\bbet(?:s|ting)?\b/, /\bgambl\w*\b/, /\bcasino\b/, /\bjackpot\b/, /\bbookmaker\b/, /\bwager\w*\b/]) {
  assert(!term.test(publicSources), `public Prediction Arena copy must not contain ${term}`);
}
assert(publicSources.includes("prediction arena"));
assert(publicSources.includes("prediction amount"));
console.log("prediction public-copy checks passed");
