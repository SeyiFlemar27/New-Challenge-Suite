import assert from "node:assert/strict";
import { read } from "./production-flow-test-utils.mjs";
const source = read(
"app/wallet/page.tsx"
);
assert(source.includes("DoroCoins cannot be withdrawn or converted to cash"), "missing " + "DoroCoins cannot be withdrawn or converted to cash");
console.log("test-phase6-dorocoin-non-withdrawable checks passed");
