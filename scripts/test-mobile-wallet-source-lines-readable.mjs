import assert from "node:assert/strict";
import { read } from "./production-flow-test-utils.mjs";
const source = read("app/earnings/page.tsx");
assert(source.includes("data-mobile-wallet-summary"));
assert(source.includes("data-mobile-wallet-source-lines"));
for (const marker of ["challenge_winner_prize", "sponsor_prize", "prediction_reward", "creator_challenge_earning"]) assert(source.includes(marker), marker);
console.log("mobile wallet source lines: ok");
