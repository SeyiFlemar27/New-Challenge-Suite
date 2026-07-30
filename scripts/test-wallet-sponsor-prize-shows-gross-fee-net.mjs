import assert from "node:assert/strict";
import { read } from "./production-flow-test-utils.mjs";
const page = read("app/wallet/page.tsx");
assert(page.includes("Sponsor-funded prize"));
assert(page.includes("grossAmountCents") && page.includes("feeAmountCents") && page.includes("netAmountCents"));
console.log("wallet sponsor prize fee detail checks passed");
