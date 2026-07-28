import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const detail = readFileSync("app/challenges/[id]/page.tsx", "utf8");
const journey = readFileSync("lib/server/participant-journey.ts", "utf8");

assert(detail.includes("window.setTimeout(() => void refetch()"), "detail page must refetch when submission opens");
assert(detail.includes('action === "submit_entry"'), "detail page must render submit action");
assert(detail.includes('href={`/challenges/${challengeId}/join`}'), "Submit Entry must route to join/submission page");
assert(journey.includes('"Ready to submit"') && journey.includes('"submit_entry"'), "backend journey must transition eligible entrants to submit");
assert(journey.includes("phase.canSubmit"), "transition must be based on canonical submission window");
console.log("challenge detail submit transition checks passed");
