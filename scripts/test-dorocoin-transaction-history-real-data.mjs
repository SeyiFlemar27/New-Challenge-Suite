import assert from "node:assert/strict";
import { read } from "./production-flow-test-utils.mjs";
const api = read("app/api/wallet/route.ts");
const page = read("app/dorocoins/page.tsx");
assert(api.includes('db.collection("doroCoinTransactions")'));
assert(page.includes("Recent DoroCoin activity") && page.includes("transactions.slice"));
assert(!page.includes("fake"));
console.log("real DoroCoin transaction history checks passed");
