import assert from "node:assert/strict";
import { read } from "./production-flow-test-utils.mjs";
const wallet = read("app/api/wallet/route.ts");
const withdrawals = read("app/api/withdrawals/route.ts");
assert(wallet.includes("requireRequestUser") && wallet.includes('where("userId", "==", user.uid)'));
assert(withdrawals.includes("source.userId !== user.uid"));
console.log("wallet ownership checks passed");
