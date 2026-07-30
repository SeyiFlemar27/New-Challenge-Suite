import assert from "node:assert/strict";
import { read } from "./production-flow-test-utils.mjs";

const settlement = read("lib/server/challenge-settlement.ts");
const approval = read("app/api/admin/challenges/[id]/winner-proposals/[proposalId]/approve/route.ts");
const tournamentResults = read("app/api/tournaments/[id]/results/route.ts");
const liveRegistration = read("app/api/events/[id]/registrations/route.ts");

assert(settlement.includes("Admin-approved winners are required before settlement."));
assert(settlement.includes("getConfirmedSettlementSources"));
assert(settlement.includes("confirmedOnly: true"));
assert(settlement.includes("payoutProviderCalled: false"));
assert(approval.includes("createInternalChallengeSettlement"));
assert(tournamentResults.includes('payoutStatus: "pending_admin_review"'));
assert(liveRegistration.includes("Paid live event checkout is not configured yet."));
console.log("Paid specialized competition settlement gate checks passed.");
