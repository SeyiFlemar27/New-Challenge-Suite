import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const builder = readFileSync("components/challenge-builder.tsx", "utf8");

assert(builder.includes('import { formatChallengeDateTime } from "@/lib/challenge-date-time"'));
for (const label of ["Registration Close", "Challenge/Submissions Start", "Submission Deadline", "Voting/Review Close", "Winner Announcement"]) {
  assert(builder.includes(`"${label}"`), `review summary is missing ${label}.`);
}
for (const field of ["registrationDeadline", "startsAt", "submissionDeadline", "votingDeadline", "endsAt"]) {
  assert(builder.includes(`formatChallengeDateTime(form.${field}, timeZone)`), `review summary must format ${field}.`);
}
assert(!builder.includes('"Submission Close": form.submissionDeadline'), "review summary must not display the raw datetime-local value.");

console.log("Create challenge review timeline summary checks passed.");
