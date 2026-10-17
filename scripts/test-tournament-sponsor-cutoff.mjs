import assert from "node:assert/strict";
import { isTournamentSponsorPaymentTimely, tournamentSponsorCutoff } from "../lib/server/tournament-sponsor-cutoff.ts";

const base = {
  tournament: { firstVotingOpenedAt: "2026-10-17T12:02:00.000Z", tournamentVotingCutoffAt: "2026-10-17T12:02:00.000Z" },
  reservationCreatedAt: "2026-10-17T12:00:00.000Z",
  reservationExpiresAt: "2026-10-17T12:15:00.000Z",
  providerCompletionUpperBoundAt: "2026-10-17T12:01:58.000Z",
  providerTimestampPrecisionMs: 1000,
  observedAt: new Date("2026-10-17T12:20:00.000Z"),
};
let assertions = 0;
function check(patch, expected, reason) {
  assert.equal(isTournamentSponsorPaymentTimely({ ...base, ...patch }), expected, reason);
  assertions++;
}
check({}, true, "delayed delivery preserves independently verified pre-cutoff evidence");
check({ providerCompletionUpperBoundAt: "2026-10-17T12:01:59.000Z" }, false, "uncertainty reaches cutoff");
check({ providerCompletionUpperBoundAt: "2026-10-17T12:02:00.000Z" }, false, "exact cutoff");
check({ providerCompletionUpperBoundAt: "2026-10-17T12:08:00.000Z" }, false, "reservation cannot authorize post-cutoff confirmation");
check({ providerCompletionUpperBoundAt: null }, false, "ambiguous evidence");
check({ tournament: {}, observedAt: new Date("2026-10-17T12:01:59.000Z") }, true, "confirmed before any voting activation");
check({ tournament: {}, observedAt: new Date("2026-10-17T12:01:58.500Z") }, false, "future evidence interval");
check({ tournament: {}, providerCompletionUpperBoundAt: base.reservationExpiresAt }, false, "expiry equality");
check({ tournament: { firstVotingOpenedAt: "invalid" } }, false, "malformed authoritative cutoff");
check({ tournament: { ...base.tournament, tournamentVotingCutoffAt: "2026-10-17T12:03:00.000Z" } }, false, "inconsistent cutoff aliases");
check({ reservationCreatedAt: base.tournament.firstVotingOpenedAt }, false, "creation at cutoff");
check({ providerTimestampPrecisionMs: -1 }, false, "invalid evidence precision");
assert.equal(tournamentSponsorCutoff({}), null); assertions++;
console.log(`Tournament Sponsor cutoff: ${assertions} assertions passed. Deterministic policy tests only; no provider verification.`);
