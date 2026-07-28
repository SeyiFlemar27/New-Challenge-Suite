import assert from "node:assert/strict"; import { read } from "./production-flow-test-utils.mjs";
const wallet=read("lib/server/wallet-architecture.ts"), revenue=read("lib/server/revenue-sharing.ts");
assert(wallet.includes('predictionArenaPlatformFeePercent: 7'));
assert(revenue.includes('predictionStakeFoundation') && revenue.includes('PREDICTION_PLATFORM_FEE_PERCENT'));
console.log("Phase 9 Prediction Arena fee checks passed.");