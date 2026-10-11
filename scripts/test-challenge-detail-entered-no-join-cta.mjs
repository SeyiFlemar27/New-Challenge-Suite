import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const detail = readFileSync("app/challenges/[id]/page.tsx", "utf8");
const journey = readFileSync("lib/server/participant-journey.ts", "utf8");

assert(detail.includes('const participantJourneyStep = (details as any)?.userState?.participantJourney?.step;'), "detail page must read the server-authored participant journey state");
assert(detail.includes('participantJourneyStep !== "entered_waiting_submission"'), "the waiting state must be scoped to an entered participant awaiting submission");
assert(detail.includes('journey?.label ?? "Challenge Entry"'), "the contextual journey label must come from the server-authored state");
assert(detail.includes('if (action === "wait_for_submission") return <SubmissionCountdown'), "waiting participants must see the submission countdown rather than a join action");
assert(journey.includes('"wait_for_submission"'), "entered waiting state must use passive submission action");
assert(journey.includes('"submit_entry"'), "eligible entered state must transition to submit");
assert.match(journey, /primaryAction === "wait_for_submission"\s*\?\s*null/, "waiting state must not link back to the same challenge or expose join navigation");
assert(!/entered_waiting_submission[\s\S]{0,250}"back_to_challenge"/.test(journey), "entered waiting state must not point back to the current page");
console.log("challenge detail entered CTA checks passed");
