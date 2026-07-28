import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
const api = readFileSync("app/api/explore/challenges/route.ts", "utf8");
assert(api.includes("isPublicChallenge"), "server-side public visibility filter required");
assert(api.includes("publicChallengeFields"), "Explore API must sanitize fields");
assert(api.includes("privateFieldsExcluded"), "API should declare private field exclusion");
assert(!/private invitation|kyc|refund|contract/i.test(api), "Explore API must not expose sensitive field labels");
console.log("explore discovery query safety checks passed");