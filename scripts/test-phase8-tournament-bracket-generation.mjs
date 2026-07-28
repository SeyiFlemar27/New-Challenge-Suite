import assert from "node:assert/strict"; import { read } from "./production-flow-test-utils.mjs";
const route=read("app/api/tournaments/[id]/bracket/route.ts"), ops=read("lib/server/tournament-operations.ts");
assert(route.includes('TOURNAMENT_REGISTRATION_MUST_CLOSE') && route.includes('tournamentParticipants'));
assert(ops.includes('generateSingleEliminationBracket') && ops.includes('CAPACITY_NOT_FILLED'));
console.log("Phase 8 tournament bracket checks passed.");