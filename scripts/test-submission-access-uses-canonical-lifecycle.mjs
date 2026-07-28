import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const access = readFileSync("lib/server/challenge-viewer-state.ts", "utf8");
const status = readFileSync("lib/challenge-status.ts", "utf8");

assert(access.includes("getChallengeLifecycleState(challenge, now)"), "submission access must use canonical lifecycle");
assert(access.includes("getChallengePhaseSummary(challenge, now"), "submission access must use canonical phase summary");
assert(access.includes("if (!phaseSummary.canSubmit || !lifecycle.canSubmit)"), "submission access must require both canonical lifecycle checks");
assert(status.includes('["submissionDeadline", "submissionEndAt", "submissionClosesAt"'), "canonical timeline must prefer submission-specific deadline fields");
console.log("canonical submission access checks passed");
