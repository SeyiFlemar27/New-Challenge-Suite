import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { CHALLENGE_TIME_ZONE_OPTIONS } from "../lib/challenge-date-time.ts";

const builder = readFileSync("components/challenge-builder.tsx", "utf8");
const expected = ["America/New_York", "America/Chicago", "America/Denver", "America/Los_Angeles", "America/Anchorage", "Pacific/Honolulu", "Africa/Lagos"];
assert.deepEqual(CHALLENGE_TIME_ZONE_OPTIONS.map((option) => option.value), expected);
assert(builder.includes("CHALLENGE_TIME_ZONE_OPTIONS.map"));
assert(builder.includes("All challenge times will be shown in the selected timezone."));
assert(!builder.includes("Europe/London"));
console.log("builder timezone selector US and WAT checks passed");
