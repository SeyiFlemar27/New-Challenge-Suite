import assert from "node:assert/strict";
import { read } from "./production-flow-test-utils.mjs";
const source = read("app/challenges/[id]/page.tsx");
assert(source.includes("data-mobile-sticky-cta"));
assert(source.includes("mobileJourneyActionVisible"));
assert(source.includes("participantJourney"));
assert(source.includes("mobile-sticky-action"));
console.log("mobile challenge sticky CTA: ok");
