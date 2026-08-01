import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const page = readFileSync("app/dashboard/page.tsx", "utf8");
const usage = readFileSync("app/api/challenges/usage/route.ts", "utf8");
assert(page.includes('"/api/challenges/usage"'), "Free dashboard must load real usage");
assert(page.includes("Free Basic Challenge allowance"), "Free dashboard must explain the allowance");
assert(page.includes("3 Free Basic Challenges"), "Free dashboard must state the lifetime limit");
assert(page.includes("freeBasic.remaining"), "Free dashboard must show remaining usage");
assert(usage.includes("FREE_BASIC_CHALLENGE_LIFETIME_LIMIT"), "usage must be server-derived");
assert(usage.includes('rule: "lifetime"'), "limit must remain lifetime based");
console.log("Free Basic Challenge limit checks passed");
