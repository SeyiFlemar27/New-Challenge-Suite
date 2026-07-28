import assert from "node:assert/strict";
import { read } from "./production-flow-test-utils.mjs";
const source = read(
"app/api/wallet/route.ts"
);
assert(source.includes("ensureCashWalletFoundation"), "missing " + "ensureCashWalletFoundation");
assert(source.includes("db.collection(\"cashTransactions\")"), "missing " + "db.collection(\"cashTransactions\")");
assert(source.includes("normalizeCashWallet"), "missing " + "normalizeCashWallet");
console.log("test-phase6-no-fake-wallet-balances checks passed");
