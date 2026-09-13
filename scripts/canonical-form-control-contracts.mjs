import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (path) => readFileSync(path, "utf8");
const registry = read("lib/forms/field-control-registry.ts");
const options = read("lib/forms/canonical-options.ts");
const controls = read("components/canonical-form-controls.tsx");
const capacity = read("lib/normal-challenge-capacity.ts");
const normalSteps = read("components/normal-challenge-builder-steps.tsx");
const normalModel = read("lib/normal-challenge-builder-model.ts");
const genericBuilder = read("components/challenge-builder.tsx");
const liveBuilder = read("components/host/host-competition-wizard.tsx");
const tournamentBuilder = read("components/tournament-builder.tsx");
const challengeSchema = read("lib/server/challenge-validation.ts");
const draftRoute = read("app/api/challenges/drafts/[id]/route.ts");
const sponsorOnboarding = read("app/sponsor/onboarding/page.tsx");
const sponsorProfile = read("app/api/sponsor/profile/route.ts");
const sponsorProposal = read("app/sponsor/proposals/new/page.tsx");
const sponsorProposalApi = read("app/api/sponsor/proposals/route.ts");
const planAccess = read("lib/plan-access.ts");

for (const field of ["country", "countries", "timezone", "category", "subcategory", "preferredSponsorCategories", "tournamentBracketSize", "judge", "challengeLead", "fundingPurpose", "payoutMethod"]) {
  assert.match(registry, new RegExp(`\\b${field}:`), `${field} must have a canonical field-control rule`);
}
for (const status of ["challengeStatus", "participantStatus", "submissionStatus", "payoutStatus"]) {
  assert.match(registry, new RegExp(`${status}: \\{ control: "system-status"`), `${status} must remain system controlled`);
}
assert.match(registry, /FREEFORM_AUTHORING_FIELDS[\s\S]*"title"[\s\S]*"challengeRules"[\s\S]*"supportBody"/);
assert.match(registry, /assertCorrectFieldControl/);

assert.match(controls, /export function SearchSelect/);
assert.match(controls, /role="combobox"/);
assert.match(controls, /role="listbox"/);
assert.match(controls, /role="option"/);
assert.match(controls, /aria-activedescendant/);
assert.match(controls, /event\.key === "ArrowDown"/);
assert.match(controls, /event\.key === "ArrowUp"/);
assert.match(controls, /event\.key === "Enter"/);
assert.match(controls, /event\.key === "Escape"/);
assert.match(controls, /export function MultiSelect/);
assert.match(controls, /aria-multiselectable="true"/);
assert.match(controls, /export function EntityPicker/);
assert.match(controls, /onChange\(option\.id\)/, "entity pickers must persist canonical IDs");
assert.match(controls, /export function MultiEntityPicker/);
assert.match(controls, /export function ChoiceCards/);
assert.match(controls, /export function CurrencyInput/);
assert.match(controls, /export function DateTimePicker/);
assert.match(controls, /export function LocationPicker/);

assert.match(options, /SPONSOR_CATEGORY_OPTIONS/);
assert.match(options, /normalizeSponsorCategories\(value: unknown, maximum = 3\)/);
assert.match(options, /Array\.from\(new Set/);
assert.match(options, /TOURNAMENT_BRACKET_SIZES = \[4, 8, 16, 32, 64, 128\]/);
assert.match(options, /COUNTRY_OPTIONS/);
assert.match(options, /TIMEZONE_OPTIONS/);
assert.match(options, /isCanonicalCountryCode/);
assert.match(options, /isCanonicalTimezone/);

assert.match(capacity, /parseOptionalCapacity/);
assert.match(capacity, /value === "" \|\| value === null \|\| value === undefined\) return null/);
assert.match(capacity, /Capacity must be a valid number/);
assert.match(capacity, /Capacity must be a whole number/);
assert.match(capacity, /Capacity must be at least 2/);
assert.match(capacity, /mode === "unlimited"\) return null/);
assert.match(capacity, /normalizeNormalChallengeCapacity[\s\S]*validateCapacity/, "Normal Challenge must normalize legacy unlimited capacity through the shared parser");
assert.doesNotMatch(capacity, /NORMAL_CHALLENGE_MAX_PARTICIPANTS/);

assert.match(normalSteps, /<SearchSelect label="Category \*"/);
assert.match(normalSteps, /update\("subcategory", ""\)/, "changing category must clear an incompatible subcategory");
assert.match(normalSteps, /<MultiSelect label="Eligible countries"/);
assert.match(normalSteps, /<SearchSelect label="Timezone \*"/);
assert.match(normalSteps, /<MultiSelect label="Preferred sponsor categories"[\s\S]*maximum=\{3\}/);
assert.match(normalModel, /preferredSponsorCategories: normalizeSponsorCategories/);
assert.match(normalModel, /preferredSponsorCategory: normalizeSponsorCategories\(form\.preferredSponsorCategories\)\[0\] \?\? ""/, "legacy singular sponsor category must remain readable/writable during migration");

for (const [name, source] of [["Private", genericBuilder], ["Live Event", liveBuilder], ["Tournament", tournamentBuilder]]) {
  assert.match(source, /SPONSOR_CATEGORY_OPTIONS/, `${name} builder must use canonical sponsor categories`);
  assert.match(source, /maximum=\{3\}/, `${name} builder must cap sponsor categories at three`);
}
assert.match(tournamentBuilder, /TOURNAMENT_BRACKET_SIZES/);
assert.doesNotMatch(tournamentBuilder, /\[4, 8, 16, 32, 64, 128\]/, "Tournament builder must consume the shared bracket-size source");

assert.match(challengeSchema, /eligibleCountries: z\.array\([\s\S]*isCanonicalCountryCode/);
assert.match(challengeSchema, /timeZone: z\.string\(\)[\s\S]*isCanonicalTimezone/);
assert.match(challengeSchema, /preferredSponsorCategories:[\s\S]*isCanonicalSponsorCategory[\s\S]*\.max\(3\)/);
assert.match(challengeSchema, /sponsorCategories:[\s\S]*isCanonicalSponsorCategory[\s\S]*\.max\(3\)/);
assert.match(draftRoute, /normalizeSponsorCategories\(monetization\.preferredSponsorCategories \?\? monetization\.preferredSponsorCategory\)/);
assert.match(draftRoute, /patch\.eligibleCountries[\s\S]*normalizeCountryCode[\s\S]*isCanonicalCountryCode/);
assert.equal((genericBuilder.match(/mode === "private" && step === 2\) return/g) ?? []).length, 1, "Private eligibility must have one canonical rendered branch");

assert.match(sponsorOnboarding, /<MultiSelect label="Preferred sponsorship categories"[\s\S]*maximum=\{3\}/);
assert.match(sponsorOnboarding, /<SearchSelect label="Industry"/);
assert.match(sponsorOnboarding, /<SearchSelect label="Country"/);
assert.match(sponsorProfile, /normalizeSponsorCategories/);
assert.match(sponsorProfile, /isCanonicalCountryCode/);
assert.match(sponsorProposal, /<CanonicalSearchSelect label="Sponsor category"/);
assert.doesNotMatch(sponsorProposal, /<Field label="Sponsor category"><input/);
assert.match(sponsorProposalApi, /sponsorCategory: normalizeSponsorCategory/);

assert.doesNotMatch(planAccess, /teamMemberLimit: 999/, "undefined Enterprise seat caps must not be represented by fake unlimited values");
assert.match(planAccess, /enterprise:[\s\S]*teamMemberLimit: null/);

console.log("PASS canonical-form-control-contracts.mjs");
