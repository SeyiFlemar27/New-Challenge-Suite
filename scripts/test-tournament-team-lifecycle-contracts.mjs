import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const teams = readFileSync("app/api/tournaments/[id]/teams/route.ts", "utf8");
const submissions = readFileSync("app/api/tournaments/[id]/submissions/route.ts", "utf8");
const checkIn = readFileSync("app/api/tournaments/[id]/check-in/route.ts", "utf8");
const bracket = readFileSync("app/api/tournaments/[id]/bracket/route.ts", "utf8");

for (const action of ["create", "invite", "accept_invite", "request_join", "accept_request", "leave", "transfer_captain", "disband", "ready"]) assert(teams.includes(`action === "${action}"`), `Missing Team action: ${action}`);
assert.match(teams, /tournamentTeamMemberships/);
assert.match(teams, /ALREADY_ON_TEAM/);
assert.match(teams, /TEAM_FULL/);
assert.match(teams, /rosterLockedAt/);
assert.match(teams, /webhookConfirmed === true/);
assert.match(submissions, /TEAM_CAPTAIN_SUBMISSION_REQUIRED/);
assert.match(checkIn, /rosterLockedAt: now/);
assert.match(bracket, /tournamentTeams/);
assert.match(bracket, /rosterLockedAt/);
console.log("tournament Team lifecycle contracts: ok");
