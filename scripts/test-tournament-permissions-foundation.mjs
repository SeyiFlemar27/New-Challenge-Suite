import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
const permissions = readFileSync(join(process.cwd(), "lib/server/tournament-permissions.ts"), "utf8");
assert(permissions.includes("canCreateTournament") && permissions.includes("getPersonalCapabilities(profile).canCreateTournament") && permissions.includes("isApprovedEnterprise"), "Tournament creation must use canonical Creator/Host capabilities or approved Enterprise access.");
assert(permissions.includes("sponsors_cannot_participate_as_competitors"), "Sponsors must not compete as participants.");
for (const helper of ["canManageTournamentParticipants", "canManageTournamentRounds", "canManageTournamentMatches", "canManageTournamentJudges", "canViewTournamentFinance", "canOverrideTournamentResult"]) assert(permissions.includes(helper), `${helper} must exist.`);
assert(!permissions.includes("isManager: true"), "Sensitive tournament permissions must not collapse to one broad isManager flag.");
console.log("Tournament permission foundation checks passed.");
