import assert from "node:assert/strict";
import { read } from "./production-flow-test-utils.mjs";
const architecture = read("lib/server/wallet-architecture.ts");
const route = read("app/api/withdrawals/route.ts");
assert(architecture.includes("minimumWithdrawalAmountCents: 5000"));
assert(route.includes("amountCents < minimumWithdrawalCents"));
console.log("minimum $50 withdrawal checks passed");
