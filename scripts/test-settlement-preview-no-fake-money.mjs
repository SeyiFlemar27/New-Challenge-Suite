import assert from "node:assert/strict";
import { read } from "./production-flow-test-utils.mjs";
const preview = read("app/api/admin/challenges/[id]/winner-proposals/[proposalId]/preview/route.ts");
const prize = read("lib/server/prize-approvals.ts");
const flow = read("lib/server/challenge-production-flow.ts");
assert(preview.includes("buildPrizeApprovalPreview") && prize.includes("sourceConfirmedOnly: true"), "settlement preview must use confirmed sources only");
assert(flow.includes("payoutExecuted: false") && flow.includes("providerExecutionEnabled: false"), "settlement foundation must not execute payouts or providers");
assert(!flow.includes("fake") && !preview.includes("mock"), "settlement preview must not add fake money");
console.log("settlement preview no fake money checks passed");