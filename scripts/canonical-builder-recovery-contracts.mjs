import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";

const read = (path) => readFileSync(path, "utf8");
const capacity = await import(pathToFileURL("lib/normal-challenge-capacity.ts"));

const registry = read("lib/challenge-builder-registry.ts");
const frame = read("components/challenge-builder-frame.tsx");
const normal = read("components/normal-challenge-builder.tsx") + read("components/normal-challenge-builder-steps.tsx");
const privateBuilder = read("components/challenge-builder.tsx");
const live = read("components/host/host-competition-wizard.tsx");
const tournament = read("components/tournament-builder.tsx");
const createRoute = read("app/api/challenges/route.ts");
const publishRoute = read("app/api/challenges/[id]/publish/route.ts");
const draftRoute = read("app/api/challenges/drafts/[id]/route.ts");
const payment = read("components/payment-status-journey.tsx");
const serverValidation = read("lib/server/challenge-validation.ts");
const tournamentValidation = read("lib/server/tournament-validation.ts");
const autosave = read("lib/hooks/use-challenge-builder-autosave.ts");

for (const source of [normal, privateBuilder, live, tournament]) {
  assert.match(source, /ChallengeBuilderFrame/, "Every canonical builder must use the shared frame.");
  assert.match(source, /BuilderFooter/, "Every canonical builder must use the shared footer.");
  assert.match(source, /useChallengeBuilderAutosave/, "Every canonical builder must use shared autosave.");
  assert.doesNotMatch(source, /autosaveVersion|saveVersion/, "Canonical builders must not keep duplicate autosave version engines.");
}
assert.match(autosave, /window\.setTimeout/);
assert.match(autosave, /requestVersion\.current/);
assert.match(autosave, /version === requestVersion\.current/);
assert.match(frame, /Step \{currentStep \+ 1\} of \{steps\.length\}/);
assert.match(frame, /Builder Guide/);
assert.match(frame, /Finish Later/);
assert.match(frame, /Submit for Review/);

for (const [type, count] of [["normal", 8], ["private", 9], ["tournament", 10], ["live_event", 10]]) {
  const marker = `${type}: [`;
  const start = registry.indexOf(marker);
  const end = registry.indexOf("].map", start);
  assert(start >= 0 && end > start, `Missing ${type} registry.`);
  assert.equal((registry.slice(start, end).match(/\["[^"]+", "[^"]+"\]/g) || []).length, count, `${type} must have ${count} canonical steps.`);
}

const routeContracts = new Map([
  ["app/challenges/create/page.tsx", "NormalChallengeBuilder"],
  ["app/host/challenges/create/page.tsx", "NormalChallengeBuilder"],
  ["app/private/create/page.tsx", "PrivateChallengeBuilder"],
  ["app/host/private/create/page.tsx", "PrivateChallengeBuilder"],
  ["app/live/create/page.tsx", "LiveEventBuilder"],
  ["app/host/live/create/page.tsx", "LiveEventBuilder"],
  ["app/enterprise/challenges/create/official/tournament/page.tsx", "TournamentBuilder"]
]);
for (const [path, component] of routeContracts) assert.match(read(path), new RegExp(component), `${path} must use ${component}.`);
for (const path of routeContracts.keys()) {
  const source = read(path);
  assert.doesNotMatch(source, /HostCompetitionWizard|mode="public"/, `${path} must not activate an obsolete builder.`);
}
assert.doesNotMatch(live, /function WizardStep|HostVerticalStepper|max="50"|Participant approval required/);
assert.doesNotMatch(privateBuilder.slice(privateBuilder.indexOf("function PrivateEligibilityStep"), privateBuilder.indexOf("function PrivateReview")), /approvalRequired|Approval required/);
assert.doesNotMatch(normal, /Creator approval required|Request to join/);
for (const route of [createRoute, publishRoute]) {
  assert.match(route, /participantApprovalMode: "automatic"/);
  assert.match(route, /requiresParticipantApproval: false/);
}

for (const value of [2, 3, 100, 10000]) {
  assert.equal(capacity.validateCapacity("limited", value), value);
}
for (const value of [0, 1, -1, 2.5, "abc", "2 people"]) {
  assert.throws(() => capacity.validateCapacity("limited", value));
}
for (const value of ["", null, undefined]) assert.equal(capacity.validateCapacity("unlimited", value), null);
assert.equal(capacity.normalizeNormalChallengeCapacity(0), null, "Legacy zero must read as unlimited.");
assert.match(draftRoute, /validateCapacity\(capacityMode/);
assert.doesNotMatch(normal + privateBuilder + live + draftRoute + serverValidation, /maxParticipants[^\n]*(?:max=\{50\}|max\(50\))/);
assert.match(serverValidation, /normalChallengeCapacityError\(value\.maxParticipants, capacityMode\)/);
assert.match(serverValidation, /capacityMode === "unlimited" \? null : value\.maxParticipants/);

assert.match(serverValidation, /eventCapacity: value\.isLiveEvent \? maxParticipants : value\.eventCapacity/);
assert.match(draftRoute, /patch\.eventCapacity = patch\.maxParticipants/);

assert.match(tournamentValidation, /const capacity = Number\(input\.participantCapacity \?\? 0\)/);
assert.match(tournamentValidation, /!Number\.isInteger\(capacity\)/);
assert.doesNotMatch(tournamentValidation, /Math\.trunc\(Number\(input\.participantCapacity/);

assert.doesNotMatch(normal, /\$\{usd\(/, "Formatted USD values must not receive a second dollar prefix.");
for (const purpose of ["subscription_payment", "dorocoin_purchase", "challenge_entry_payment", "prize_pool_funding", "sponsor_contribution", "vote_purchase", "challenge_boost_purchase", "platform_prize_funding"]) assert.match(payment, new RegExp(`${purpose}:`));
assert.doesNotMatch(payment, /Activating Host plan|Host plan active/);
assert.match(payment, /Payment confirmation progress/);

console.log("canonical builder recovery contracts: ok");
