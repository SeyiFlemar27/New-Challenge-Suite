import assert from "node:assert/strict";
import { read } from "./production-flow-test-utils.mjs";
const adminApprove = read("app/api/admin/challenges/[id]/winner-proposals/[proposalId]/approve/route.ts");
const adminFinalize = read("app/api/admin/challenges/[id]/winner-proposals/[proposalId]/finalize-ledger/route.ts");
const prize = read("lib/server/prize-approvals.ts");
assert(adminApprove.includes("requireAdminUser") && adminFinalize.includes("requireAdminUser"), "winner validation/finalization must require admin");
assert(prize.includes("Admin approval is required before settlement") && prize.includes("payoutProviderCalled: false"), "internal settlement must be admin-gated with no payout execution");
assert(prize.includes("Duplicate winner users are not allowed"), "winner proposal validation must block duplicate winners");
console.log("winner validation admin gate checks passed");
