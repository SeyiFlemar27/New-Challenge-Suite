import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
const api = readFileSync("app/api/explore/challenges/route.ts", "utf8");
assert(api.includes("Manage Challenge"), "owner manage CTA required");
assert(api.includes("Pay & Enter"), "paid-entry CTA required");
assert(api.includes("Register"), "free registration CTA required");
assert(api.includes("View Voting"), "voting CTA required");
assert(api.includes("isSponsorProfile"), "sponsor role handling required");
console.log("explore card contextual action checks passed");