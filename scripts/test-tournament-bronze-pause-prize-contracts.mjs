import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const operations = readFileSync("lib/server/tournament-operations.ts", "utf8");
const results = readFileSync("app/api/tournaments/[id]/results/route.ts", "utf8");
const management = readFileSync("app/api/tournaments/[id]/manage/actions/route.ts", "utf8");

assert.match(operations, /_bronze_match/);
assert.match(operations, /semifinal\.loserNextMatchId = bronzeMatchId/);
assert.match(results, /match\.bracket === "bronze"/);
assert.match(results, /competitorCollection = tournament\.participationMode === "team"/);
assert.match(results, /cumulativeTournamentScore/);
assert.match(results, /TOURNAMENT_RESULT_METHOD_REQUIRED/);
assert.match(operations, /splitTeamPrizeEqually/);
assert.match(operations, /pending_hold/);
assert.match(operations, /resolveTournamentNoSubmission/);
assert.match(operations, /extensionHours: 12/);
assert.match(management, /action === "pause" \|\| action === "resume"/);
assert.match(management, /pausedFromStatus/);
assert.match(management, /durationMs/);
assert.match(management, /shiftedDates/);
console.log("tournament bronze, pause, scoring, and prize contracts: ok");
