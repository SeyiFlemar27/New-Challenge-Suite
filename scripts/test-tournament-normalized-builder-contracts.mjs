import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const builder = readFileSync("components/tournament-builder.tsx", "utf8");
const validation = readFileSync("lib/server/tournament-validation.ts", "utf8");
const draft = readFileSync("lib/server/tournaments.ts", "utf8");

for (const step of ["Overview", "Tournament Format", "Eligibility & Participation", "Monetization & Prize Pool", "Media & Branding", "Competition Method", "Schedule & Round Timing", "Entry & Round Submissions", "Review", "Publish"]) assert(builder.includes(`"${step}"`));
assert.match(builder, /lg:grid-cols-\[270px_minmax\(0,1fr\)\].*xl:grid-cols-\[270px_minmax\(0,760px\)_280px\]/s);
assert.match(builder, /Builder Guide/);
assert.match(builder, /Finish Later/);
assert.match(builder, /Submit for Review/);
assert.doesNotMatch(builder, /signed-in-user/);
assert.match(builder, /\[4, 8, 16, 32, 64, 128\]/);
assert.match(builder, /"individual", "team"/);
assert.match(validation, /TOURNAMENT_REGISTRATION_TYPES[^\n]+\["open", "invite_only"\]/);
assert.match(validation, /Hybrid is unavailable until normalized scoring is configured/);
assert.match(draft, /seedingMethod: "ranking"/);
console.log("normalized Tournament Builder contracts: ok");
