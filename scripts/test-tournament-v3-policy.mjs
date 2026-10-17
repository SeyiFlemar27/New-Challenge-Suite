import assert from "node:assert/strict";
import { advanceWinner, canUseLegacyTournamentAdminResultOverride, generateTournamentBracket, evaluateTournamentJoinEligibility, isTournamentCompetitorVoter, resolveTournamentSubmissionDeadline, resolveTournamentVoteEventSequence, validateTournamentSubmission, validateTournamentVote } from "../lib/server/tournament-operations.ts";
import { validateTournamentPlacementEvidence } from "../lib/server/tournament-settlement-policy.ts";
import { publicTournamentParticipantIds, publicTournamentParticipantView, publicTournamentView } from "../lib/server/tournament-public-policy.ts";

const tournament = {
  id: "v3-full",
  hostId: "host",
  configVersion: 3,
  status: "registration_open",
  format: "single_elimination",
  participationMode: "individual",
  participantCapacity: 4,
  participantCount: 4,
  entryType: "free",
  resultMethod: "votes",
  seedingMethod: "random",
  thirdPlaceMethod: "third_place_match",
  tieBreaker: "pre_recorded_priority"
};
const participants = Array.from({ length: 4 }, (_, index) => ({
  id: `p${index + 1}`,
  tournamentId: tournament.id,
  userId: `u${index + 1}`,
  status: "registered",
  checkInStatus: "not_required",
  seed: index + 1,
  createdAt: new Date(index).toISOString(),
  updatedAt: new Date(index).toISOString()
}));

const fullBracket = generateTournamentBracket({ tournament, participants, existingMatches: [] });
assert.equal(fullBracket.created, true);
assert.equal(fullBracket.expectedMatchCount, 4, "four entrants produce three matches plus the required bronze match");
assert.ok(fullBracket.matches.filter((match) => match.roundNumber === 1).every((match) => match.participantAId && match.participantBId), "every first-round match has two entrants and no byes");
assert.ok(fullBracket.matches.filter((match) => match.roundNumber === 1).every((match) => ["A", "B"].includes(match.tiePrioritySlot)), "first-round tie priority is recorded before opening");

const partialBracket = generateTournamentBracket({ tournament, participants: participants.slice(0, 3), existingMatches: [] });
assert.equal(partialBracket.created, false);
assert.equal(partialBracket.code, "BRACKET_REQUIRES_FULL_CAPACITY");

const fullEligibility = evaluateTournamentJoinEligibility({
  tournament,
  actor: { uid: "u5", role: "creator" },
  participants,
  rulesAccepted: true,
  profileComplete: true,
  now: new Date("2026-01-01T00:00:00Z")
});
assert.equal(fullEligibility.allowed, false);
assert.equal(fullEligibility.code, "TOURNAMENT_CAPACITY_REACHED");

const match = { id: "m", participantAId: "A", participantBId: "B", voteCountA: 2, voteCountB: 2, voteSequence: 4, tiePrioritySlot: "B" };
const tieEvents = [
  { voteSequence: 1, selectedParticipantId: "A", status: "recorded" },
  { voteSequence: 2, selectedParticipantId: "B", status: "recorded" },
  { voteSequence: 3, selectedParticipantId: "B", status: "recorded" },
  { voteSequence: 4, selectedParticipantId: "A", status: "recorded" }
];
const sequenceTie = resolveTournamentVoteEventSequence({ match, votes: tieEvents });
assert.equal(sequenceTie.valid, true);
assert.equal(sequenceTie.winnerParticipantId, "B", "first participant to reach the final tied tally wins");
assert.equal(sequenceTie.resolution, "final_tally_sequence");

const emptyTie = resolveTournamentVoteEventSequence({ match: { ...match, voteCountA: 0, voteCountB: 0, voteSequence: 0 }, votes: [] });
assert.equal(emptyTie.valid, true);
assert.equal(emptyTie.winnerParticipantId, "B", "zero-vote tie uses the pre-recorded priority");
assert.equal(emptyTie.resolution, "pre_recorded_priority");

const corruptSequence = resolveTournamentVoteEventSequence({ match, votes: tieEvents.map((event) => ({ ...event, voteSequence: event.voteSequence + 1 })) });
assert.equal(corruptSequence.valid, false);
assert.equal(corruptSequence.code, "VOTE_EVENT_INTEGRITY_FAILED");

const noPriority = resolveTournamentVoteEventSequence({ match: { ...match, tiePrioritySlot: undefined, voteCountA: 0, voteCountB: 0, voteSequence: 0 }, votes: [] });
assert.equal(noPriority.valid, false);
assert.equal(noPriority.code, "TIE_PRIORITY_MISSING");
assert.equal(isTournamentCompetitorVoter({ userId: "user-a", participationMode: "individual", competitor: { id: "tournament_user-a", userId: "user-a" }, teamId: "" }), true, "individual competitor checks use the canonical participant userId");
assert.equal(isTournamentCompetitorVoter({ userId: "user-b", participationMode: "individual", competitor: { id: "tournament_user-a", userId: "user-a" }, teamId: "" }), false, "unrelated voter is not treated as the individual competitor");
assert.equal(isTournamentCompetitorVoter({ userId: "team-member", participationMode: "team", competitor: { memberUserIds: ["team-member"] }, teamId: "team-a" }), true, "every locked team member is blocked from voting in the team's match");
assert.equal(canUseLegacyTournamentAdminResultOverride({ configVersion: 3, isAdmin: true, reason: "correction" }), false, "V3 Admin result correction cannot bypass competition evidence");
assert.equal(canUseLegacyTournamentAdminResultOverride({ configVersion: 2, isAdmin: true, reason: "legacy correction" }), true, "legacy Admin correction behavior remains available");
const deadline = "2026-01-01T01:00:00.000Z";
assert.equal(resolveTournamentSubmissionDeadline({ participantAStatus: "approved", participantBStatus: "approved", extensionAlreadyUsed: false, submissionDeadlineAt: deadline, now: new Date("2026-01-01T00:59:59.999Z") }).action, "waiting", "submission window remains open until its exact deadline");
assert.equal(resolveTournamentSubmissionDeadline({ participantAStatus: "approved", participantBStatus: "approved", extensionAlreadyUsed: false, submissionDeadlineAt: deadline, now: new Date(deadline) }).action, "open_voting", "voting may open only at the deadline after both entries are approved");
assert.equal(resolveTournamentSubmissionDeadline({ participantAStatus: "approved", participantBStatus: "submitted", extensionAlreadyUsed: false, submissionDeadlineAt: deadline, now: new Date("2026-01-01T01:00:00.000Z") }).action, "review", "pending moderation cannot consume the voting window");
assert.equal(resolveTournamentSubmissionDeadline({ participantAStatus: "approved", participantBStatus: null, extensionAlreadyUsed: false, submissionDeadlineAt: deadline, now: new Date("2026-01-01T01:00:00.000Z") }).action, "forfeit", "one valid entry after the deadline follows the verified forfeit path");
assert.equal(resolveTournamentSubmissionDeadline({ participantAStatus: null, participantBStatus: null, extensionAlreadyUsed: false, submissionDeadlineAt: deadline, now: new Date("2026-01-01T01:00:00.000Z") }).action, "extend", "two absent entries receive one extension");
assert.equal(resolveTournamentSubmissionDeadline({ participantAStatus: null, participantBStatus: null, extensionAlreadyUsed: true, submissionDeadlineAt: deadline, now: new Date("2026-01-01T01:00:00.000Z") }).action, "double_forfeit_hold", "repeat absence is held without manufacturing a winner");
const v3VotingConfig = { ...tournament, status: "active", configVersion: 3 };
const v3Match = { id: "m-vote", tournamentId: tournament.id, roundId: "r1", roundNumber: 1, status: "voting_open", participantAId: "p1", participantBId: "p2", resultMethod: "votes", votingOpenedAt: "2026-01-01T00:00:00.000Z", votingClosesAt: "2026-01-01T01:00:00.000Z" };
const v3Round = { id: "r1", tournamentId: tournament.id, roundNumber: 1, status: "draft", votingOpensAt: null, votingClosesAt: null };
assert.equal(validateTournamentVote({ tournament: v3VotingConfig, match: { ...v3Match, status: "active" }, round: v3Round, now: new Date("2026-01-01T00:30:00.000Z") }).valid, false, "V3 voting requires the authoritative match-level voting phase");
assert.equal(validateTournamentVote({ tournament: v3VotingConfig, match: v3Match, round: v3Round, now: new Date("2026-01-01T00:00:00.000Z") }).valid, true, "V3 voting opens at the persisted match opening timestamp");
assert.equal(validateTournamentVote({ tournament: v3VotingConfig, match: v3Match, round: v3Round, now: new Date("2026-01-01T01:00:00.000Z") }).valid, false, "V3 voting closes exactly at the persisted match deadline");
const occupiedAdvance = advanceWinner({ match: { id: "source", winnerParticipantId: "p1", nextMatchId: "next", nextSlot: "A" }, existingNextMatch: { id: "next", participantAId: "p2", participantBId: null } });
assert.equal(occupiedAdvance.advanced, false, "bracket advancement cannot overwrite an already assigned entrant");
assert.equal(occupiedAdvance.code, "ADVANCEMENT_SLOT_OCCUPIED");
const submissionTiming = { id: "r-sub", tournamentId: tournament.id, roundNumber: 1, title: "Round 1", brief: "", status: "active", startsAt: "2026-01-01T00:00:00.000Z", endsAt: deadline, votingOpensAt: null, votingClosesAt: null };
const submissionBase = { tournament, round: submissionTiming, mediaUrl: "https://media.example/file", mediaPath: "tournaments/t/matches/m/images/file.jpg", mediaType: "image", now: new Date("2026-01-01T00:59:59.999Z") };
assert.equal(validateTournamentSubmission(submissionBase).valid, true, "official content can be submitted before the persisted deadline");
assert.equal(validateTournamentSubmission({ ...submissionBase, now: new Date(deadline) }).code, "SUBMISSION_DEADLINE_CLOSED", "official content is rejected exactly at its deadline");
assert.equal(validateTournamentSubmission({ ...submissionBase, existingStatus: "submitted", replacementAllowed: false }).code, "REPLACEMENT_NOT_ALLOWED", "replacement remains disabled unless the Tournament explicitly permits it");
assert.equal(validateTournamentSubmission({ ...submissionBase, existingStatus: "approved", replacementAllowed: true }).code, "SUBMISSION_ALREADY_RECORDED", "approved submissions cannot be overwritten by an ordinary retry");
assert.equal(validateTournamentVote({ tournament: { ...v3VotingConfig, status: "under_review" }, match: { ...v3Match, bracket: "bronze" }, round: v3Round, now: new Date("2026-01-01T00:30:00.000Z") }).valid, true, "the pending bronze match remains eligible while championship placements await review");
assert.equal(validateTournamentVote({ tournament: { ...v3VotingConfig, status: "under_review", settlementId: "already_finalized" }, match: { ...v3Match, bracket: "bronze" }, round: v3Round, now: new Date("2026-01-01T00:30:00.000Z") }).valid, false, "a settled Tournament cannot reopen bronze voting");

const singleTournament = { id: "settlement-se", format: "single_elimination" };
const finalEvidence = { tournamentId: "settlement-se", status: "confirmed", bracket: "winners", nextMatchId: null, participantAId: "p1", participantBId: "p2", winnerParticipantId: "p1", loserParticipantId: "p2" };
assert.equal(validateTournamentPlacementEvidence(singleTournament, { placement: 1, participantId: "p1" }, finalEvidence), true, "first place must match the confirmed final winner");
assert.equal(validateTournamentPlacementEvidence(singleTournament, { placement: 1, participantId: "p2" }, finalEvidence), false, "a fabricated first-place identity is rejected");
assert.equal(validateTournamentPlacementEvidence(singleTournament, { placement: 2, participantId: "p2" }, { ...finalEvidence, status: "active" }), false, "unconfirmed results cannot support placements");
assert.equal(validateTournamentPlacementEvidence(singleTournament, { placement: 1, participantId: "p1" }, { ...finalEvidence, tournamentId: "another" }), false, "cross-tournament source matches are rejected");
assert.equal(validateTournamentPlacementEvidence(singleTournament, { placement: 3, participantId: "p3" }, { ...finalEvidence, bracket: "bronze", participantAId: "p3", participantBId: "p4", winnerParticipantId: "p3", loserParticipantId: "p4" }), true, "third place requires its confirmed bronze match");
const doubleTournament = { id: "settlement-de", format: "double_elimination" };
assert.equal(validateTournamentPlacementEvidence(doubleTournament, { placement: 1, participantId: "p1" }, { ...finalEvidence, tournamentId: "settlement-de", bracket: "grand_final" }), true, "double-elimination champion requires a confirmed Grand Final");
assert.equal(validateTournamentPlacementEvidence(doubleTournament, { placement: 3, participantId: "p4" }, { ...finalEvidence, tournamentId: "settlement-de", bracket: "losers", nextMatchId: "settlement-de_grand_final", participantAId: "p3", participantBId: "p4", winnerParticipantId: "p3", loserParticipantId: "p4" }), true, "double-elimination third place follows the last valid Losers Bracket elimination");
assert.equal(validateTournamentPlacementEvidence(doubleTournament, { placement: 3, participantId: "p3" }, { ...finalEvidence, tournamentId: "settlement-de", bracket: "losers", nextMatchId: "settlement-de_grand_final", participantAId: "p3", participantBId: "p4", winnerParticipantId: "p3", loserParticipantId: "p4" }), false, "double-elimination third place cannot be assigned to a finalist");

const publicView = publicTournamentView({ id: "public-tournament", title: "Public", hostId: "private-host", financeLedger: { bank: "private" }, tiePriority: "A", prizePool: { confirmedPrizePoolMinor: 5000, sponsorSourceIds: ["private-source"] }, coverMedia: { url: "https://media.example/cover.jpg", path: "private/path" } });
assert.equal(publicView.title, "Public");
assert.equal("hostId" in publicView, false, "public projection omits owner identity");
assert.equal("financeLedger" in publicView, false, "public projection omits financial internals");
assert.deepEqual(publicView.prizePool, { confirmedPrizePoolMinor: 5000, status: "confirmed_sources" }, "public projection exposes confirmed total and safe reconciliation status without source identifiers");
assert.deepEqual(publicView.coverMedia, { url: "https://media.example/cover.jpg" }, "public projection omits private Storage path");
const participantsForView = [{ id: "t_opaque-user-a", seed: 2 }, { id: "t_opaque-user-b", seed: 1 }];
const publicIds = publicTournamentParticipantIds(participantsForView);
assert.notEqual(publicIds.get("t_opaque-user-a"), "t_opaque-user-a", "public entrant references do not expose stored participant document IDs");
const participantView = publicTournamentParticipantView({ id: "t_user-private", userId: "user-private", inviteId: "invite-private", status: "active", seed: 1 }, "entrant-1");
assert.deepEqual(participantView, { id: "entrant-1", status: "active", seed: 1 }, "public participant projection omits user and invitation identifiers");

console.log("Tournament V3 policy tests passed (55 assertions).");
