import assert from "node:assert/strict";
import { read } from "./production-flow-test-utils.mjs";
const helper = read("lib/dorocoin-purchase.ts");
const page = read("app/dorocoins/page.tsx");
assert(helper.includes("DOROCOINS_PER_USD = 50"));
assert(page.includes("$1.00 buys 50 DoroCoins"));
console.log("custom DoroCoin rate checks passed");
