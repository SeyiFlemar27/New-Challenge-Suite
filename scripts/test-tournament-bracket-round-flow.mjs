import assert from "node:assert/strict";
import { read } from "./production-flow-test-utils.mjs";

const bracketRoute = read("app/api/tournaments/[id]/bracket/route.ts");
const resultRoute = read("app/api/tournaments/[id]/results/route.ts");
const operations = read("lib/server/tournament-operations.ts");

assert(bracketRoute.includes("generateSingleEliminationBracket"));
assert(bracketRoute.includes('where("tournamentId", "==", id)'));
assert(bracketRoute.includes("TOURNAMENT_REGISTRATION_MUST_CLOSE"));
assert(resultRoute.includes("resolveMatchResult"));
assert(resultRoute.includes("advanceWinner"));
assert(operations.includes("seedParticipants"));
assert(operations.includes("finalPlacements"));
console.log("Tournament bracket and round flow checks passed.");
