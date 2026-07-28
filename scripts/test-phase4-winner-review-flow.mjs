import assert from "node:assert/strict";
import { read } from "./production-flow-test-utils.mjs";
const flow = read("lib/server/challenge-production-flow.ts");
const approvals = read("lib/server/prize-approvals.ts");
assert(flow.includes("start_review") && flow.includes("admin_winner_validation_required"));
assert(approvals.includes("winnerProposalLifecycleReadiness") && approvals.includes("validateWinnerProposalWinners"));
console.log("phase4 winner review checks passed");