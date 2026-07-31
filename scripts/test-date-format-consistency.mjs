import assert from "node:assert/strict";
import { read } from "./production-flow-test-utils.mjs";
const utils = read("lib/utils.ts");
const challengeTime = read("lib/challenge-date-time.ts");
assert(utils.includes("formatAppDateTime") && utils.includes('timeZoneName: "short"'));
assert(utils.includes('replace(/, (\\d{1,2}:\\d{2})/, " at $1")'));
assert(challengeTime.includes("formatChallengeDateTime") && challengeTime.includes("resolveChallengeTimeZone"));
console.log("date format consistency checks passed");
