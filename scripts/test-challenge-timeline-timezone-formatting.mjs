import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { formatChallengeDateTime, resolveChallengeTimeZone } from "../lib/challenge-date-time.ts";

const formatter = readFileSync("lib/challenge-date-time.ts", "utf8");
const phase = readFileSync("lib/challenge-status.ts", "utf8");
const publicChallenge = readFileSync("lib/server/public-challenge.ts", "utf8");

assert(formatter.includes('DEFAULT_CHALLENGE_TIME_ZONE = "America/New_York"'), "Eastern Time must be the default");
assert(formatter.includes("source.timezone") && formatter.includes("source.timeZone"), "challenge timezone aliases must be supported");
assert(formatter.includes("source.creatorTimeZone") && formatter.includes("source.creatorTimezone"), "creator-selected timezone aliases must be supported");
assert(formatter.includes("record.toDate") && formatter.includes("record.seconds"), "Firestore Timestamp values must be supported");
assert(formatter.includes('"Africa/Lagos": "WAT"'), "Africa/Lagos must display WAT");
assert(phase.includes("timeZone: timeline.timezone"), "phase summary must expose canonical timezone");
assert(publicChallenge.includes('"timezone", "timeZone"'), "public lifecycle payload must preserve safe timezone fields");
const expectedWat = "Jul 28, 6:00 PM WAT";
assert.equal(formatChallengeDateTime("2026-07-28T17:00:00.000Z", "Africa/Lagos"), expectedWat, "ISO timestamp must format in WAT");
assert.equal(formatChallengeDateTime({ seconds: 1785258000, nanoseconds: 0 }, "Africa/Lagos"), expectedWat, "Firestore timestamp shape must format identically");
assert.equal(resolveChallengeTimeZone({ timezone: "Europe/London", timeZone: "Africa/Lagos" }), "Europe/London", "challenge.timezone must take priority");
assert.equal(resolveChallengeTimeZone({ timeZone: "America/New_York" }), "America/New_York", "creator-selected timeZone must be preserved");
assert.equal(resolveChallengeTimeZone({}), "America/New_York", "missing timezone must use Eastern Time fallback");
console.log("challenge timeline timezone formatting checks passed");
