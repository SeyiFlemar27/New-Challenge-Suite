import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
const lifecycle = readFileSync(join(process.cwd(), "lib/server/tournament-lifecycle.ts"), "utf8");
for (const name of ["canPublishTournament", "canOpenRegistration", "canCloseRegistration", "canGenerateBracket", "canStartRound", "canCloseVoting", "canConfirmMatchResult", "canAdvanceRound", "canCompleteTournament", "canPauseTournament", "canCancelTournament"]) assert(lifecycle.includes(`function ${name}`), `${name} helper must exist.`);
assert(lifecycle.includes("INVALID_TOURNAMENT_TRANSITION"), "Invalid tournament transitions must be rejected.");
assert(lifecycle.includes("registration_open") && lifecycle.includes("round_review") && lifecycle.includes("winners_announced"), "Tournament statuses must include registration/round/winner states.");
console.log("Tournament lifecycle foundation checks passed.");
