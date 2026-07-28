import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const api = readFileSync("app/api/submissions/route.ts", "utf8");
const lifecycle = readFileSync("lib/server/submission-lifecycle.ts", "utf8");
const status = readFileSync("lib/challenge-status.ts", "utf8");

assert(api.includes("isChallengeSubmittable(challenge)"), "final submit API must run the canonical preflight gate");
assert(api.includes("isChallengeSubmittable(freshChallenge)"), "final submit transaction must recheck fresh canonical state");
assert(lifecycle.includes("getChallengeLifecycleState(challenge, now)"), "submission API helper must delegate to canonical lifecycle");
assert(status.includes("if (closesAt && now >= closesAt) return \"submissions_closed\""), "canonical API gate must block the exact deadline");
assert(api.includes("freshSubmittable.reason"), "transaction rejection must preserve the canonical closed reason");
assert(!api.includes("now >") && !api.includes("now <="), "submission API must not carry a competing local deadline comparison");
console.log("final submit exact-deadline API checks passed");
