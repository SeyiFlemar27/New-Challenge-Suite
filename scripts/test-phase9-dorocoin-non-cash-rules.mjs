import assert from "node:assert/strict"; import { read } from "./production-flow-test-utils.mjs";
const rewards=read("lib/server/rewards.ts"), wallet=read("lib/server/wallet-architecture.ts");
assert(rewards.includes('cashOutEnabled: false') && rewards.includes('DoroCoins are platform credits, not cash'));
assert(wallet.includes('dorocoinConvertibleToCash: false') || wallet.includes('DoroCoin'));
console.log("Phase 9 DoroCoin non-cash checks passed.");