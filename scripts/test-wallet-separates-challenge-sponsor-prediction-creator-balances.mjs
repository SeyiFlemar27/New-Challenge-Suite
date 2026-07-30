import assert from "node:assert/strict";
import { read } from "./production-flow-test-utils.mjs";
const route = read("app/api/wallet/route.ts");
for (const source of ["challenge_winner_prize", "sponsor_prize", "prediction_reward", "creator_challenge_earning"]) assert(route.includes(source) || read("app/wallet/page.tsx").includes(source), `missing source ${source}`);
assert(route.includes("cashEarnings") && route.includes("challengeTitle"));
console.log("wallet source separation checks passed");
