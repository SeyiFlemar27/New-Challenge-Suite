import assert from "node:assert/strict";
import { read } from "./production-flow-test-utils.mjs";
const service = read("lib/server/withdrawals.ts");
assert(service.includes('status: "pending_review"'));
assert(service.includes("payoutExecuted: false") && service.includes("transferEnabled: false"));
console.log("withdrawal pending review checks passed");
