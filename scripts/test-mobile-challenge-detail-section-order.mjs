import assert from "node:assert/strict";
import { read } from "./production-flow-test-utils.mjs";
const source = read("app/challenges/[id]/page.tsx");
const media = read("components/challenge-media-carousel.tsx");
const order = ["data-mobile-challenge-meta", "<ChallengeMediaGallery", "data-mobile-creator-row", "data-mobile-primary-action", "Challenge Guide", "Leading Participants", "Comments", "Explore More Challenges"];
let cursor = -1;
for (const marker of order) { const next = source.indexOf(marker, cursor + 1); assert(next > cursor, marker); cursor = next; }
assert(media.includes('data-challenge-media-gallery'), "challenge detail must render the shared responsive media gallery");
assert(media.includes("aspect-[16/10]"), "shared challenge media must preserve its responsive 16:10 frame");
console.log("mobile challenge detail section order: ok");
