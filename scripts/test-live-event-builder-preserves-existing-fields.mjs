import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const wizard = readFileSync("components/host/host-competition-wizard.tsx", "utf8");

for (const field of [
  "title", "description", "category", "coverImageUrl", "coverImagePath",
  "venueName", "eventAddress", "eventCity", "eventCountry",
  "startsAt", "submissionDeadline", "votingStartsAt", "votingDeadline", "endsAt",
  "maxParticipants", "approvalRequired", "registrationQuestions",
  "externalLiveUrl", "prizeDescription", "winnerSelection",
  "allowSponsorInterest", "sponsorVisibilityAreas"
]) {
  assert(wizard.includes(field), `Live Event builder lost field: ${field}`);
}
assert(wizard.includes('initialCompetitionType="Live Event"') === false, "route-owned initial type belongs outside the shared wizard.");
assert(wizard.includes('form.competitionType === "Live Event"'));

console.log("Live Event existing-field preservation checks passed.");
