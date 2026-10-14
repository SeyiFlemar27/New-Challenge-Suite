import assert from "node:assert/strict";
import { isValidatedWinnerAnnouncement, validateAuthoritativeWinnerRecords, authoritativeWinnerCount, hasExplicitNoWinnersOutcome } from "../lib/server/official-winner-records.ts";

let assertions = 0;
function equal(actual, expected, message) { assertions += 1; assert.equal(actual, expected, message); }
const challengeId = "challenge-1";
const base = [
  { id: "winner-1", challengeId, userId: "user-1", submissionId: "submission-1", position: 1, status: "announced" },
  { id: "winner-2", challengeId, userId: "user-2", submissionId: "submission-2", position: 2, status: "announced" },
  { id: "winner-3", challengeId, userId: "user-3", submissionId: "submission-3", position: 3, status: "paid" }
];
equal(validateAuthoritativeWinnerRecords(challengeId, base, 3).valid, true, "complete distinct winner records validate");
equal(validateAuthoritativeWinnerRecords(challengeId, base.slice(0, 2), 3).valid, false, "missing configured winner record blocks transition");
equal(validateAuthoritativeWinnerRecords(challengeId, [{ ...base[0], challengeId: "another-challenge" }], 1).valid, false, "cross-challenge winner record is rejected");
equal(validateAuthoritativeWinnerRecords(challengeId, [{ ...base[0], submissionId: null }], 1).valid, false, "winner without an authoritative submission is rejected");
equal(validateAuthoritativeWinnerRecords(challengeId, [{ ...base[0], userId: "" }], 1).valid, false, "winner without a user is rejected");
equal(validateAuthoritativeWinnerRecords(challengeId, [{ ...base[0], position: 0 }], 1).valid, false, "invalid placement is rejected");
equal(validateAuthoritativeWinnerRecords(challengeId, [{ ...base[0] }, { ...base[1], position: 1 }], 2).valid, false, "duplicate placement is rejected");
equal(validateAuthoritativeWinnerRecords(challengeId, [{ ...base[0] }, { ...base[1], userId: "user-1" }], 2).valid, false, "duplicate user is rejected");
equal(validateAuthoritativeWinnerRecords(challengeId, [{ ...base[0] }, { ...base[1], submissionId: "submission-1" }], 2).valid, false, "duplicate submission is rejected");
equal(validateAuthoritativeWinnerRecords(challengeId, [{ ...base[0], status: "draft" }], 1).valid, false, "non-authoritative winner status is rejected");
equal(isValidatedWinnerAnnouncement({ officialWinnerRecordsValidatedAt: "now", officialWinnerRecordIds: ["a", "b"], officialWinnerRecordCount: 2 }), true, "validated record marker is structurally complete");
equal(isValidatedWinnerAnnouncement({ officialWinnerRecordsValidatedAt: "now", officialWinnerRecordIds: ["a"], officialWinnerRecordCount: 2 }), false, "inconsistent record marker is rejected");
equal(authoritativeWinnerCount({ numberOfWinners: 3, normalLifecyclePolicyVersion: 1, approvedWinnerIds: ["user-1", "user-2"] }), 2, "Normal count follows the verified qualified allocation");
equal(authoritativeWinnerCount({ numberOfWinners: 3, approvedWinnerIds: ["user-1", "user-2"] }), 3, "historical exact winner count remains unchanged");
equal(authoritativeWinnerCount({ numberOfWinners: 3, normalLifecyclePolicyVersion: 1, approvedWinnerIds: [] }), 3, "empty approval cannot enable zero-winner announcement");
equal(authoritativeWinnerCount({ numberOfWinners: 3, normalLifecyclePolicyVersion: 1, approvedWinnerIds: ["user-1", "user-1"] }), 3, "duplicate approval cannot reduce required winner records");
const noWinners = { builderVersion: "normal_v3", normalLifecyclePolicyVersion: 1, status: "completed", normalOutcome: "no_winners", outcomeReason: "no_valid_votes" };
equal(hasExplicitNoWinnersOutcome(noWinners), true, "explicit Normal No Winners completion is distinct from missing results");
equal(hasExplicitNoWinnersOutcome({ ...noWinners, status: "active" }), false, "active challenge cannot masquerade as completed No Winners");
equal(hasExplicitNoWinnersOutcome({ ...noWinners, normalLifecyclePolicyVersion: undefined }), false, "historical missing results remain an integrity issue");
console.log(`PASS authoritative winner record validation: ${assertions} assertions.`);
