import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const api = readFileSync("app/api/submissions/route.ts", "utf8");
const lifecycle = readFileSync("lib/server/submission-lifecycle.ts", "utf8");
const status = readFileSync("lib/challenge-status.ts", "utf8");

assert(api.includes("isChallengeSubmittable(challenge)"), "submission API must use canonical lifecycle before writing");
assert(api.includes("isChallengeSubmittable(freshChallenge)"), "submission transaction must recheck fresh challenge state");
assert(lifecycle.includes("getChallengeLifecycleState(challenge, now)"), "server submission helper must delegate to canonical lifecycle");
assert(status.includes("if (opensAt && now < opensAt)") && status.includes("if (closesAt && now >= closesAt)"), "open-window API rule must allow start and reject deadline");
console.log("final submit API open-window checks passed");
