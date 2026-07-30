import assert from "node:assert/strict"; import { read } from "./production-flow-test-utils.mjs";
const route=read("app/api/predictions/route.ts"), revenue=read("lib/server/revenue-sharing.ts");
assert(route.includes('dorocoinAllowed: false'));
assert(route.includes('DOROCOIN_NOT_ALLOWED'));
assert(route.includes('DoroCoins cannot be used in Prediction Arena.'));
assert(!revenue.includes('stakeAmountDorocoin') && !revenue.includes('platformFeeDorocoin'));
console.log("Phase 9 no DoroCoin prediction staking checks passed.");
