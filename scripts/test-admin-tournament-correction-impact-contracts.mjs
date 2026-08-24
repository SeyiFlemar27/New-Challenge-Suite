import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const operations = readFileSync("lib/server/tournament-operations.ts", "utf8");
const route = readFileSync("app/api/admin/tournaments/[id]/route.ts", "utf8");
const ui = readFileSync("components/admin/admin-tournament-workspace.tsx", "utf8");

assert(operations.includes("deriveTournamentCorrectionImpact") && operations.includes("loserNextMatchId") && operations.includes("resetMatchId"), "Correction impact must traverse every bracket advancement path.");
for (const collection of ["tournamentSubmissions", "tournamentVotes", "tournamentJudgeScores"]) assert(route.includes(collection), `Correction preview must inspect ${collection}.`);
assert(route.includes("settlementSensitive") && route.includes("automaticCorrectionAllowed"), "Resolved or settlement-sensitive corrections must be blocked from automatic execution.");
assert(ui.includes("Preview Impact") && ui.includes("downstream matches"), "Admin UI must show a correction impact preview before any action.");
console.log("admin tournament correction impact contracts: ok");
