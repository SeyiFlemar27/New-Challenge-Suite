import assert from "node:assert/strict";
import { read } from "./production-flow-test-utils.mjs";
const approval = read("app/api/admin/challenges/[id]/winner-proposals/[proposalId]/approve/route.ts");
assert(approval.includes("tieAtWinnerBoundary") && approval.includes("configuredTieBreaker"));
assert(approval.includes("WINNER_TIE_REQUIRES_ADMIN_REVIEW") && approval.includes("adminNote"));
console.log("winner tie admin review checks passed");
