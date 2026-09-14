import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const builder = readFileSync("components/tournament-builder.tsx", "utf8");
const validation = readFileSync("lib/server/tournament-validation.ts", "utf8");
const draft = readFileSync("lib/server/tournaments.ts", "utf8");
const registry = readFileSync("lib/challenge-builder-registry.ts", "utf8");
const frame = readFileSync("components/challenge-builder-frame.tsx", "utf8");

for (const step of ["Overview", "Tournament Format", "Eligibility & Participation", "Monetization & Prize Pool", "Media & Branding", "Competition Method", "Schedule & Round Timing", "Entry & Round Submissions", "Review", "Publish"]) assert(registry.includes(`"${step}"`));
assert.match(frame, /lg:grid-cols-\[270px_minmax\(0,1fr\)\].*xl:grid-cols-\[270px_minmax\(0,760px\)_280px\]/s);
assert.match(frame, /Builder Guide/);
assert.match(frame, /Finish Later/);
assert.match(frame, /Submit for Review/);
assert.doesNotMatch(builder, /signed-in-user/);
assert.match(validation, /\[4, 8, 16, 32, 64, 128\]/);
assert.match(builder, /"individual", "team"/);
assert.match(validation, /TOURNAMENT_REGISTRATION_TYPES[^\n]+\["open", "invite_only"\]/);
assert.match(validation, /Hybrid is unavailable until normalized scoring is configured/);
assert.match(draft, /seedingMethod: "ranking"/);
console.log("normalized Tournament Builder contracts: ok");
