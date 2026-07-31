import assert from "node:assert/strict";
import { read } from "./production-flow-test-utils.mjs";
const source = read("app/earnings/page.tsx");
for (const forbidden of ["DoroCoin", "doroCoin", "Buy Package", "Watch Rewarded Ad"]) assert(!source.includes(forbidden));
for (const required of ["cashWallet", "cashEarnings", "Withdrawal"]) assert(source.includes(required));
console.log("earnings DoroCoin separation checks passed");
