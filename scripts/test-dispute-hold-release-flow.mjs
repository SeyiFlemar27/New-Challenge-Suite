import assert from "node:assert/strict";
import { read } from "./production-flow-test-utils.mjs";
const disputes = read("lib/server/disputes.ts");
const flow = read("lib/server/challenge-production-flow.ts");
const wallet = read("lib/server/wallet-architecture.ts");
for (const status of ["open", "under_review", "resolved", "rejected", "escalated", "closed"]) assert(disputes.includes(status), `dispute status ${status} must exist`);
assert(disputes.includes("providerExecutionEnabled: false") && flow.includes("review_hold_required"), "disputes must hold review without provider execution");
assert(wallet.includes("held") && wallet.includes("blocked_review"), "wallet states must support held/blocked review balances");
console.log("dispute hold release flow checks passed");