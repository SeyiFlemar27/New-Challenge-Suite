import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const route = readFileSync("app/api/tournaments/[id]/teams/route.ts", "utf8");
const ui = readFileSync("components/tournament-team-manager.tsx", "utf8");
const dashboard = readFileSync("app/tournaments/[id]/me/page.tsx", "utf8");

for (const action of ["reject_request", "revoke_invite", "remove_member", "transfer_captain", "confirm_captain_transfer"]) assert(route.includes(`action === "${action}"`), `Missing server Team action ${action}`);
assert(route.includes("tournamentCaptainTransfers") && route.includes("team_captain_transfer_accepted"), "Captain transfer must require an audited recipient confirmation.");
for (const label of ["Invite Members", "Join Requests", "Accept Invitation", "Mark Team Ready", "Accept Captain Role"]) assert(ui.includes(label), `Missing Team management UI: ${label}`);
assert(dashboard.includes("TournamentTeamManager"), "Team management must render in the participant dashboard.");
console.log("tournament Team management UI contracts: ok");
