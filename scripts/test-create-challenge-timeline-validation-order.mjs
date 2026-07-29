import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const source = readFileSync("lib/server/challenge-validation.ts", "utf8");

assert(source.includes("registrationDeadline > submissionStartAt"), "registration close must be checked against submission start.");
assert(source.includes("submissionDeadline <= submissionStartAt"), "submission deadline must be strictly after submission start.");
assert(source.includes("submissionDeadline > votingDeadline"), "submission deadline must not exceed voting/review close.");
assert(source.includes("votingDeadline >= endsAt"), "winner announcement must be strictly after voting/review close.");
assert(!source.includes("submissionDeadline > startsAt) makeIssue(errors, \"SUBMISSION_AFTER_START\""), "the inverted deadline-before-start rule must be removed.");

const valid = {
  registrationCloseAt: Date.parse("2026-07-28T21:30:00Z"),
  submissionStartAt: Date.parse("2026-07-28T21:35:00Z"),
  submissionDeadline: Date.parse("2026-07-28T22:00:00Z"),
  votingReviewCloseAt: Date.parse("2026-07-28T23:00:00Z"),
  winnerAnnouncementAt: Date.parse("2026-07-29T11:00:00Z")
};
function timelineIsValid(value) {
  return value.registrationCloseAt <= value.submissionStartAt
    && value.submissionStartAt < value.submissionDeadline
    && value.submissionDeadline <= value.votingReviewCloseAt
    && value.votingReviewCloseAt < value.winnerAnnouncementAt;
}

assert(timelineIsValid(valid));
assert(timelineIsValid({ ...valid, registrationCloseAt: valid.submissionStartAt }), "registration close may equal submission start.");
assert(!timelineIsValid({ ...valid, registrationCloseAt: valid.submissionStartAt + 1 }), "registration close after submission start must fail.");
assert(!timelineIsValid({ ...valid, submissionDeadline: valid.submissionStartAt }), "submission deadline equal to start must fail.");
assert(!timelineIsValid({ ...valid, submissionDeadline: valid.submissionStartAt - 1 }), "submission deadline before start must fail.");
assert(timelineIsValid({ ...valid, submissionDeadline: valid.votingReviewCloseAt }), "submission deadline may equal voting/review close.");
assert(!timelineIsValid({ ...valid, submissionDeadline: valid.votingReviewCloseAt + 1 }), "submission deadline after voting/review close must fail.");
assert(!timelineIsValid({ ...valid, winnerAnnouncementAt: valid.votingReviewCloseAt }), "winner announcement equal to review close must fail.");
assert(!timelineIsValid({ ...valid, winnerAnnouncementAt: valid.votingReviewCloseAt - 1 }), "winner announcement before review close must fail.");

console.log("Create challenge timeline validation order checks passed.");
