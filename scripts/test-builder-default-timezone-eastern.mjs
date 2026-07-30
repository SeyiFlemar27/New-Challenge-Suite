import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { DEFAULT_CHALLENGE_TIME_ZONE, resolveChallengeTimeZone } from "../lib/challenge-date-time.ts";

const builder = readFileSync("components/challenge-builder.tsx", "utf8");
const drafts = readFileSync("app/api/challenges/drafts/route.ts", "utf8");
assert.equal(DEFAULT_CHALLENGE_TIME_ZONE, "America/New_York");
assert.equal(resolveChallengeTimeZone({}), "America/New_York");
assert(builder.includes("timeZone: DEFAULT_CHALLENGE_TIME_ZONE"));
assert(drafts.includes("timeZone: DEFAULT_CHALLENGE_TIME_ZONE"));
console.log("builder Eastern default timezone checks passed");
