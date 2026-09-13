import assert from "node:assert/strict";
import { mkdir, rm, writeFile } from "node:fs/promises";
import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";

const root = resolve(new URL("..", import.meta.url).pathname.replace(/^\/(.:\/)/, "$1"));
const tempDir = join(root, ".tmp-challenge-publish-validation");
await rm(tempDir, { recursive: true, force: true });
await mkdir(tempDir, { recursive: true });
const lifecycleSource = readFileSync(join(root, "lib/server/challenge-lifecycle.ts"), "utf8");
const dateTimeSource = readFileSync(join(root, "lib/challenge-date-time.ts"), "utf8");
const normalCapacitySource = readFileSync(join(root, "lib/normal-challenge-capacity.ts"), "utf8");
const builderFoundationSource = readFileSync(join(root, "lib/challenge-builder-foundation.ts"), "utf8");
const normalConfigSource = readFileSync(join(root, "lib/normal-challenge-config.ts"), "utf8")
  .replace('from "@/lib/challenge-builder-foundation"', 'from "./challenge-builder-foundation.ts"');
const sponsorFoundationSource = readFileSync(join(root, "lib/sponsor-foundation.ts"), "utf8")
  .replace('import type { SponsorProductPlanId } from "@/lib/types";', 'type SponsorProductPlanId = "starter" | "growth" | "scale";');
const canonicalOptionsSource = readFileSync(join(root, "lib/forms/canonical-options.ts"), "utf8")
  .replace('from "@/lib/challenge-date-time"', 'from "./challenge-date-time.ts"')
  .replace('from "@/lib/normal-challenge-config"', 'from "./normal-challenge-config.ts"')
  .replace('from "@/lib/sponsor-foundation"', 'from "./sponsor-foundation.ts"');
const validationSource = readFileSync(join(root, "lib/server/challenge-validation.ts"), "utf8")
  .replace('import { validateChallengeDates } from "@/lib/server/challenge-lifecycle";', 'import { validateChallengeDates } from "./challenge-lifecycle.ts";')
  .replace('import { DEFAULT_CHALLENGE_TIME_ZONE } from "@/lib/challenge-date-time";', 'import { DEFAULT_CHALLENGE_TIME_ZONE } from "./challenge-date-time.ts";')
  .replace('import { inferCapacityMode, normalChallengeCapacityError } from "@/lib/normal-challenge-capacity";', 'import { inferCapacityMode, normalChallengeCapacityError } from "./normal-challenge-capacity.ts";')
  .replace('from "@/lib/normal-challenge-config"', 'from "./normal-challenge-config.ts"')
  .replace('from "@/lib/forms/canonical-options"', 'from "./canonical-options.ts"');
await writeFile(join(tempDir, "challenge-lifecycle.ts"), lifecycleSource, "utf8");
await writeFile(join(tempDir, "challenge-date-time.ts"), dateTimeSource, "utf8");
await writeFile(join(tempDir, "normal-challenge-capacity.ts"), normalCapacitySource, "utf8");
await writeFile(join(tempDir, "challenge-builder-foundation.ts"), builderFoundationSource, "utf8");
await writeFile(join(tempDir, "normal-challenge-config.ts"), normalConfigSource, "utf8");
await writeFile(join(tempDir, "sponsor-foundation.ts"), sponsorFoundationSource, "utf8");
await writeFile(join(tempDir, "canonical-options.ts"), canonicalOptionsSource, "utf8");
await writeFile(join(tempDir, "challenge-validation.ts"), validationSource, "utf8");
const { serverChallengeCreateSchema, validateChallengeForDraft, validateChallengeForPublish } = await import(pathToFileURL(join(tempDir, "challenge-validation.ts")).href);

const future = (days) => {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() + days);
  date.setUTCHours(12, 0, 0, 0);
  return date.toISOString();
};

const baseChallenge = {
  id: "challenge_123",
  creatorId: "host_1",
  title: "Complete publish-ready challenge",
  description: "A complete challenge description with enough detail for participants to understand the goal.",
  category: "Fitness",
  type: "Public Challenge",
  visibility: "public",
  acceptedSubmissionTypes: ["image"],
  competitionFormat: "Entry Competition",
  bestOf: "1 Rounder",
  registrationDeadline: future(2),
  startsAt: future(3),
  submissionStartAt: future(3),
  submissionDeadline: future(4),
  votingStartsAt: future(3),
  votingDeadline: future(5),
  endsAt: future(6),
  winnerAnnouncementAt: future(7),
  timeZone: "UTC",
  standardRules: "Submit original work. Respect all participants.",
  policyTerms: "Participants must follow platform and community rules.",
  challengeGuidelines: "Upload a relevant image submission that follows the challenge brief.",
  coverImageUrl: "https://storage.example/challenge/banner.jpg",
  coverImagePath: "challenges/drafts/host_1/banner/123-banner.jpg",
  prizeType: "bragging_rights",
  numberOfWinners: 1,
  winnerSelection: "highest_votes",
  tournamentType: "none"
};

assert.equal(serverChallengeCreateSchema.safeParse({ publish: false }).success, true, "incomplete draft payload should parse safely");
assert.equal(validateChallengeForDraft({ title: "", description: "" }).valid, true, "draft validation should allow incomplete publish fields");

const normalUnlimited = serverChallengeCreateSchema.safeParse({ ...baseChallenge, challengeType: "normal", capacityMode: "unlimited", maxParticipants: null });
assert.equal(normalUnlimited.success, true, "Normal Challenge blank capacity should mean no fixed capacity");
assert.equal(normalUnlimited.success && normalUnlimited.data.maxParticipants, null, "unlimited capacity should persist canonically as null");
const legacyNormalUnlimited = serverChallengeCreateSchema.safeParse({ ...baseChallenge, challengeType: "normal", maxParticipants: 0 });
assert.equal(legacyNormalUnlimited.success, true, "legacy Normal Challenge capacity 0 should remain readable");
assert.equal(legacyNormalUnlimited.success && legacyNormalUnlimited.data.maxParticipants, null, "legacy zero should normalize to null");
for (const value of [2, 3, 100, 10000]) {
  const parsed = serverChallengeCreateSchema.safeParse({ ...baseChallenge, challengeType: "normal", capacityMode: "limited", maxParticipants: value });
  assert.equal(parsed.success, true, `Normal Challenge capacity ${value} should be valid`);
  assert.equal(parsed.success && parsed.data.maxParticipants, value, `Normal Challenge capacity ${value} should persist unchanged`);
}
const normalCapacityOne = serverChallengeCreateSchema.safeParse({ ...baseChallenge, challengeType: "normal", capacityMode: "limited", maxParticipants: 1 });
assert.equal(normalCapacityOne.success, false, "Normal Challenge capacity 1 should be rejected");
assert.ok(!normalCapacityOne.success && normalCapacityOne.error.issues.some((issue) => issue.path[0] === "maxParticipants" && issue.message === "Set capacity to at least 2, or leave it blank for no fixed capacity."), "Normal Challenge capacity errors should be friendly");
for (const value of [0, -1, 2.5, "malformed"]) {
  assert.equal(serverChallengeCreateSchema.safeParse({ ...baseChallenge, challengeType: "normal", capacityMode: "limited", maxParticipants: value }).success, false, `Normal Challenge fixed capacity ${value} should be rejected`);
}
for (const value of [2, 3, 100, 10000]) {
  assert.equal(serverChallengeCreateSchema.safeParse({ ...baseChallenge, type: "Private Challenge", visibility: "private", capacityMode: "limited", maxParticipants: value }).success, true, `Private Challenge capacity ${value} should be valid`);
  assert.equal(serverChallengeCreateSchema.safeParse({ ...baseChallenge, type: "Live Event", isLiveEvent: true, eventCountry: "US", capacityMode: "limited", maxParticipants: value, eventCapacity: value }).success, true, `Live Event capacity ${value} should be valid`);
}
assert.equal(serverChallengeCreateSchema.safeParse({ ...baseChallenge, type: "Private Challenge", visibility: "private", capacityMode: "unlimited", maxParticipants: null }).success, true, "Private Challenge blank capacity should be unlimited");
assert.equal(serverChallengeCreateSchema.safeParse({ ...baseChallenge, type: "Live Event", isLiveEvent: true, eventCountry: "US", capacityMode: "unlimited", maxParticipants: null, eventCapacity: null }).success, true, "Live Event blank capacity should be unlimited");
for (const value of [0, 1, -1, 2.5, "malformed"]) {
  assert.equal(serverChallengeCreateSchema.safeParse({ ...baseChallenge, type: "Private Challenge", visibility: "private", capacityMode: "limited", maxParticipants: value }).success, false, `Private Challenge fixed capacity ${value} should be rejected`);
  assert.equal(serverChallengeCreateSchema.safeParse({ ...baseChallenge, type: "Live Event", isLiveEvent: true, eventCountry: "US", capacityMode: "limited", maxParticipants: value, eventCapacity: value }).success, false, `Live Event fixed capacity ${value} should be rejected`);
}
assert.equal(serverChallengeCreateSchema.safeParse({ ...baseChallenge, challengeType: "tournament", maxParticipants: 0 }).success, false, "tournament capacity minimum must remain strict");

const missingBanner = validateChallengeForPublish({ ...baseChallenge, coverImageUrl: "", coverImagePath: "" }, { userId: "host_1", now: new Date() });
assert.equal(missingBanner.valid, false, "missing banner should block publish");
assert.ok(missingBanner.errors.some((issue) => issue.code === "REQUIRED_BANNER"), "missing banner should return structured REQUIRED_BANNER error");

const invalidDates = validateChallengeForPublish({ ...baseChallenge, startsAt: future(6), endsAt: future(5) }, { userId: "host_1", now: new Date() });
assert.ok(invalidDates.errors.some((issue) => issue.code === "START_AFTER_END"), "invalid date ordering should be rejected");

const liveMissingLocation = validateChallengeForPublish({ ...baseChallenge, type: "Live Event", isLiveEvent: true, venueName: "", eventCity: "", eventCountry: "" }, { userId: "host_1", now: new Date() });
assert.ok(liveMissingLocation.errors.some((issue) => issue.code === "LIVE_LOCATION_REQUIRED"), "live events should require venue details");

const livestreamMissingUrl = validateChallengeForPublish({ ...baseChallenge, externalLiveStatus: "scheduled", externalLiveUrl: "" }, { userId: "host_1", now: new Date() });
assert.ok(livestreamMissingUrl.errors.some((issue) => issue.code === "LIVESTREAM_URL_REQUIRED"), "scheduled livestreams should require a URL");

const privateMissingInvite = validateChallengeForPublish({ ...baseChallenge, visibility: "private", type: "Private Challenge", hostOperations: { visibilityMode: "hidden" } }, { userId: "host_1", now: new Date() });
assert.ok(privateMissingInvite.errors.some((issue) => issue.code === "PRIVATE_INVITE_REQUIRED"), "private challenges should require invite settings");

const tournamentMissingStages = validateChallengeForPublish({ ...baseChallenge, type: "Tournament", competitionFormat: "knockout", tournamentType: "knockout", tournamentStages: [] }, { userId: "host_1", now: new Date() });
assert.ok(tournamentMissingStages.errors.some((issue) => issue.code === "TOURNAMENT_STAGES_REQUIRED"), "tournaments should require stage configuration");

const wrongOwnerPath = validateChallengeForPublish({ ...baseChallenge, coverImagePath: "challenges/drafts/other_user/banner/123-banner.jpg" }, { userId: "host_1", now: new Date() });
assert.ok(wrongOwnerPath.errors.some((issue) => issue.code === "INVALID_BANNER_STORAGE_PATH"), "banner path must belong to the challenge owner or challenge path");

const complete = validateChallengeForPublish(baseChallenge, { userId: "host_1", now: new Date() });
assert.equal(complete.valid, true, "complete challenge should pass publish validation");

await rm(tempDir, { recursive: true, force: true });
console.log("challenge publish validation tests passed");

