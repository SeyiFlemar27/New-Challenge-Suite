import assert from "node:assert/strict";
import { isPublicTournamentRoute } from "../lib/tournament-public-route-policy.ts";
let assertions = 0;
for (const route of ["/tournaments", "/tournaments/public-id", "/tournaments/public-id/", "/tournaments/public-id/results", "/tournaments/public-id/matches/match-one", "/tournaments/public-id/teams/entrant-1"]) {
  assert.equal(isPublicTournamentRoute(route), true, route); assertions++;
}
for (const route of ["/tournaments/create", "/tournaments/create/", "/tournaments/new", "/tournaments/manage", "/tournaments/settings", "/tournaments/public-id/join", "/tournaments/public-id/manage", "/tournaments/public-id/me", "/tournaments/public-id/lobby", "/tournaments/public-id/team-payment", "/tournaments/public-id/matches/match-one/edit", "/admin/tournaments/public-id", "/tournaments//matches/match-one", "/tournaments/public-id/teams/create"]) {
  assert.equal(isPublicTournamentRoute(route), false, route); assertions++;
}
console.log(`Tournament public page routing: ${assertions} policy assertions passed; server authorization remains independent.`);
