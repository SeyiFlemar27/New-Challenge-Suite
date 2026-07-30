import assert from "node:assert/strict";
import { read } from "./production-flow-test-utils.mjs";
const route = read("app/api/withdrawals/route.ts");
const page = read("app/wallet/withdraw/page.tsx");
assert(!route.includes('"dorocoin"') && route.includes("eligibleSourceTypes"));
assert(page.includes("DoroCoins cannot be withdrawn or converted to cash."));
console.log("withdrawal DoroCoin blocker checks passed");
