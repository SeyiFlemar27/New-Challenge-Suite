import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const join = readFileSync("app/challenges/[id]/join/page.tsx", "utf8");

assert(join.includes("submissionAccess?.canSubmit === true && participantJourney?.canSubmit === true"), "join page must require both backend submission access signals");
assert(join.includes("const canSubmitNow = backendCanSubmit"), "join page must derive its submit action from backend truth");
assert(!join.includes("getChallengeLifecycleState(currentChallenge)"), "join page must not recompute the final submission window from sanitized client data");
assert(!join.includes('setError(submissionOpen ?'), "join page must not use the stale local submission blocker");
assert(join.includes('"You can submit now."') || join.includes("participantJourney"), "open-window state must come from the participant journey");
console.log("join page open-window submission checks passed");
