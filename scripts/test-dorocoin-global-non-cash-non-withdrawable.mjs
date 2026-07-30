import assert from "node:assert/strict";
import { read } from "./production-flow-test-utils.mjs";

const wallet = read("app/wallet/page.tsx");
const withdrawal = read("app/api/withdrawals/route.ts");
const rewards = read("lib/server/rewards.ts");

assert(wallet.includes("DoroCoins are internal credits. They cannot be withdrawn or converted to cash."));
assert(wallet.includes("DoroCoins cannot be withdrawn or converted to cash."));
assert(!withdrawal.includes("doroCoinWallets"));
assert(rewards.includes("cashOutEnabled: false"));
console.log("Global DoroCoin non-cash and non-withdrawable checks passed.");
