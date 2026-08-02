import assert from "node:assert/strict";
import { read } from "./production-flow-test-utils.mjs";
const source = read("app/earnings/page.tsx");
for (const forbidden of ["doroBalance", "Buy Package", "Watch Rewarded Ad", "Purchase DoroCoins", "Convert DoroCoins"]) assert(!source.includes(forbidden));
for (const required of ["cashWallet", "cashEarnings", "Withdrawal", "without mixing Spin Credits or DoroCoins into cash"]) assert(source.includes(required));
console.log("earnings DoroCoin separation checks passed");
