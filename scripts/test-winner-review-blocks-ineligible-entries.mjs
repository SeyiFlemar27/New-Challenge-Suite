import assert from "node:assert/strict";
import { read } from "./production-flow-test-utils.mjs";
const candidates = read("lib/server/prize-approvals.ts");
const approval = read("app/api/admin/challenges/[id]/winner-proposals/[proposalId]/approve/route.ts");
for (const state of ["pending_review", "pending_payment", "withdrawn", "disqualified", "incomplete"]) assert(candidates.includes(`"${state}"`), `missing ineligible state ${state}`);
assert(approval.includes("WINNER_NOT_ELIGIBLE"));
console.log("winner ineligible entry checks passed");
