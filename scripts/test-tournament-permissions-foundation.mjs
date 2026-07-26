import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
const permissions = readFileSync(join(process.cwd(), "lib/server/tournament-permissions.ts"), "utf8");
assert(permissions.includes("canCreateTournament") && permissions.includes("access.isHost") && permissions.includes("isApprovedEnterprise"), "Tournament creation must be limited to Host, approved Enterprise, or allowed premium Creator.");
assert(permissions.includes("sponsors_cannot_participate_as_competitors"), "Sponsors must not compete as participants.");
for (const helper of ["canManageTournamentParticipants", "canManageTournamentRounds", "canManageTournamentMatches", "canManageTournamentJudges", "canViewTournamentFinance", "canOverrideTournamentResult"]) assert(permissions.includes(helper), `${helper} must exist.`);
assert(!permissions.includes("isManager: true"), "Sensitive tournament permissions must not collapse to one broad isManager flag.");
console.log("Tournament permission foundation checks passed.");
