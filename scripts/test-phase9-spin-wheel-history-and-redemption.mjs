import assert from "node:assert/strict"; import { read } from "./production-flow-test-utils.mjs";
const rewards=read("lib/server/rewards.ts"), history=read("app/api/rewards/history/route.ts");
assert(rewards.includes('spinResults') && rewards.includes('rewardSpinHistory') && rewards.includes('rewardClaims'));
assert(history.includes('userId') && history.includes('rewardClaims'));
console.log("Phase 9 spin history and redemption checks passed.");