import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const detail = readFileSync("app/challenges/[id]/page.tsx", "utf8");
const journey = readFileSync("lib/server/participant-journey.ts", "utf8");

assert(detail.includes('participantJourney?.step === "entered_waiting_submission"'), "entered viewer stage must be contextual");
assert(detail.includes('? "Entered"'), "entered viewer support text must not use generic join copy");
assert(journey.includes('"wait_for_submission"'), "entered waiting state must use passive submission action");
assert(journey.includes('"submit_entry"'), "eligible entered state must transition to submit");
assert(!/entered_waiting_submission[\s\S]{0,250}"back_to_challenge"/.test(journey), "entered waiting state must not point back to the current page");
console.log("challenge detail entered CTA checks passed");
