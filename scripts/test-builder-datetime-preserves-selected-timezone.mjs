import assert from "node:assert/strict";
import { challengeDateTimeForStorage, challengeDateTimeInputValue, formatChallengeDateTime } from "../lib/challenge-date-time.ts";

const eastern = challengeDateTimeForStorage("2026-07-30T09:00", "America/New_York");
const lagos = challengeDateTimeForStorage("2026-07-30T09:00", "Africa/Lagos");
assert.equal(eastern, "2026-07-30T13:00:00.000Z");
assert.equal(lagos, "2026-07-30T08:00:00.000Z");
assert.equal(challengeDateTimeInputValue(eastern, "America/New_York"), "2026-07-30T09:00");
assert.equal(challengeDateTimeInputValue(lagos, "Africa/Lagos"), "2026-07-30T09:00");
assert.equal(formatChallengeDateTime(eastern, "America/New_York"), "Jul 30, 9:00 AM ET");
assert.equal(formatChallengeDateTime(lagos, "Africa/Lagos"), "Jul 30, 9:00 AM WAT");
console.log("builder selected-timezone persistence checks passed");
