import assert from "node:assert/strict";
import { read } from "./production-flow-test-utils.mjs";
const source = read("app/dorocoins/page.tsx");
assert(source.includes("cannot be withdrawn or converted to cash"), "missing DoroCoin non-cash policy");
console.log("test-phase6-dorocoin-non-withdrawable checks passed");
