import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";

const read = (path) => readFileSync(path, "utf8");
const capacity = await import(pathToFileURL("lib/normal-challenge-capacity.ts"));

assert.equal(capacity.parseOptionalCapacity(""), null);
for (const value of [2, 3, 100, 10000]) assert.equal(capacity.parseOptionalCapacity(value), value);
for (const value of [0, 1, -1, 2.5, "malformed"]) assert.throws(() => capacity.parseOptionalCapacity(value));
assert.equal(capacity.normalizeNormalChallengeCapacity(0), null, "legacy zero must normalize to unlimited");
assert.throws(() => capacity.normalizeNormalChallengeCapacity(0, "limited"), "new fixed zero must be rejected");

const normalSteps = read("components/normal-challenge-builder-steps.tsx");
const normalModel = read("lib/normal-challenge-builder-model.ts");
const privateBuilder = read("components/challenge-builder.tsx");
const hostBuilder = read("components/host/host-competition-wizard.tsx");
const tournamentBuilder = read("components/tournament-builder.tsx");
const tournamentValidation = read("lib/server/tournament-validation.ts");
const draftRoute = read("app/api/challenges/drafts/[id]/route.ts");
const createRoute = read("app/api/challenges/route.ts");
const publishRoute = read("app/api/challenges/[id]/publish/route.ts");
const schema = read("lib/server/challenge-validation.ts");

assert.doesNotMatch(normalSteps, /max="50"/);
assert.match(normalSteps, /min="2" step="1"/);
assert.match(normalModel, /maxParticipants = form\.capacityMode === "unlimited" \? null : form\.maxParticipants/);
assert.match(privateBuilder, /validateCapacity\(form\.maxParticipants \? "limited" : "unlimited"/);
assert.match(privateBuilder, /maxParticipants: privateMode && form\.maxParticipants \? form\.maxParticipants : null/);
assert.match(hostBuilder, /validateCapacity\(form\.maxParticipants \? "limited" : "unlimited", form\.maxParticipants\)/);
assert.match(hostBuilder, /capacityMode, maxParticipants: participantCapacity/);
assert.doesNotMatch(hostBuilder, /Math\.min\(50|max="50"|max="50000"/);
assert.match(draftRoute, /validateCapacity\(capacityMode, patch\.maxParticipants/);
assert.doesNotMatch(draftRoute, /Math\.trunc\(Number\(patch\.maxParticipants\)/);
assert.match(draftRoute, /INVALID_PARTICIPANT_CAPACITY/);
assert.match(createRoute, /maxParticipants: body\.maxParticipants/);
assert.match(publishRoute, /serverChallengeCreateSchema\.safeParse/);
assert.doesNotMatch(schema, /maxParticipants[\s\S]{0,180}\.max\(50\)/);
assert.doesNotMatch(schema, /eventCapacity[\s\S]{0,100}\.max\(50000\)/);

assert.match(tournamentBuilder, /TOURNAMENT_BRACKET_SIZES/);
assert.match(tournamentValidation, /TOURNAMENT_BRACKET_SIZES = \[4, 8, 16, 32, 64, 128\]/);
assert.match(tournamentValidation, /Choose a bracket size of 4, 8, 16, 32, 64, or 128/);

console.log("PASS test-canonical-capacity-contracts.mjs");
