import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const detail = readFileSync("app/challenges/[id]/page.tsx", "utf8");
const journey = readFileSync("lib/server/participant-journey.ts", "utf8");

assert(detail.includes('Pay ${entryFeeLabel} & Join Challenge'), "paid challenge CTA must state the exact fee and join action");
assert(detail.includes('"Join Challenge"'), "free challenge CTA must remain Join Challenge");
assert(detail.includes('"Complete Entry Details"'), "registered users must receive an explicit entry-details continuation");
assert(journey.includes('"pay_entry_fee"'), "paid entry CTA must be driven by the canonical participant journey");
assert(journey.includes('"payment_pending"'), "payment processing must remain a distinct non-active state");
assert(detail.includes("ParticipantJourneyPanel"), "challenge summary must always render the canonical action panel");
console.log("paid challenge detail join CTA checks passed");
