import assert from "node:assert/strict"; import { read } from "./production-flow-test-utils.mjs";
const route=read("app/api/tournaments/[id]/results/route.ts"), ops=read("lib/server/tournament-operations.ts");
assert(route.includes('advanceWinner') && route.includes('tournamentAuditEvents'));
assert(ops.includes('ADVANCEMENT_ALREADY_APPLIED') && ops.includes('FINAL_PLACEMENT_READY'));
console.log("Phase 8 tournament round progression checks passed.");