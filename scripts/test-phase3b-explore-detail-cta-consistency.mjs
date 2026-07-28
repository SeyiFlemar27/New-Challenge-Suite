import assert from "node:assert/strict";
import { read } from "./production-flow-test-utils.mjs";
const explore = read("app/explore/page.tsx");
const exploreApi = read("app/api/explore/challenges/route.ts");
const detail = read("app/challenges/[id]/page.tsx");
assert(explore.includes("challenge.cta") && exploreApi.includes("ctaFor") && detail.includes("participantJourney"));
assert(detail.includes('href={`/challenges/${challengeId}/join`}'));
console.log("Phase 3B Explore/detail CTA consistency checks passed.");
