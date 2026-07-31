import assert from "node:assert/strict";
import { read } from "./production-flow-test-utils.mjs";
const page = read("app/earnings/page.tsx");
const api = read("app/api/wallet/route.ts");
assert(page.includes('fetchWallet()'));
assert(api.includes("requireRequestUser"));
assert(!page.includes("premium") && !page.includes("subscriptionRequired") && !page.includes("planId ==="));
console.log("free-user earnings access checks passed");
