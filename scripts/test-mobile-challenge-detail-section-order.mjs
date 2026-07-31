import assert from "node:assert/strict";
import { read } from "./production-flow-test-utils.mjs";
const source = read("app/challenges/[id]/page.tsx");
const order = ["data-mobile-challenge-meta", "aspect-[16/10]", "data-mobile-creator-row", "data-mobile-primary-action", "Challenge Guide", "Leading Participants", "Comments", "Explore More Challenges"];
let cursor = -1;
for (const marker of order) { const next = source.indexOf(marker, cursor + 1); assert(next > cursor, marker); cursor = next; }
console.log("mobile challenge detail section order: ok");
