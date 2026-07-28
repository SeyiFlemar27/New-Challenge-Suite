import assert from "node:assert/strict";
import { read } from "./production-flow-test-utils.mjs";
const source = read(
"lib/server/wallet-architecture.ts"
);
assert(source.includes("refund"), "missing " + "refund");
assert(source.includes("dispute"), "missing " + "dispute");
assert(source.includes("reversed"), "missing " + "reversed");
console.log("test-phase6-refund-review-states checks passed");
