import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
const publicChallenge = readFileSync("lib/server/public-challenge.ts", "utf8");
const api = readFileSync("app/api/explore/challenges/route.ts", "utf8");
assert(publicChallenge.includes("isPublicChallengeStatus"), "canonical public status helper required");
assert(publicChallenge.includes('visibility === "public"'), "private challenges must be excluded by server helper");
assert(!publicChallenge.includes('"cancelled"') && !publicChallenge.includes('"deleted"'), "cancelled/deleted should not be public statuses");
assert(api.includes("isPublicChallenge"), "Explore must reuse exclusion helper");
console.log("explore private cancelled deleted exclusion checks passed");
