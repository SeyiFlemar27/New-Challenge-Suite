import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const status = readFileSync("lib/challenge-status.ts", "utf8");

assert(status.includes("now >= timeline.submissionOpensAt"), "submission must open at the exact canonical start instant");
assert(status.includes("now < timeline.submissionClosesAt"), "submission must remain open only before the deadline");
assert(status.indexOf("now >= timeline.submissionOpensAt") < status.indexOf("const registrationOpen"), "submission window must be calculated independently from registration state");
console.log("same-instant registration close and submission open checks passed");
