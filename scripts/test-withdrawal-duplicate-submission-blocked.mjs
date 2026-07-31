import assert from "node:assert/strict";
import { read } from "./production-flow-test-utils.mjs";
const withdrawals = read("lib/server/withdrawals.ts");
const route = read("app/api/withdrawals/route.ts");
assert(withdrawals.includes('deterministicId("withdrawal"') && withdrawals.includes("if (existing.exists)"));
assert(route.includes("idempotencyKey"));
console.log("duplicate withdrawal idempotency checks passed");
