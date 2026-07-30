import assert from "node:assert/strict";
import { read } from "./production-flow-test-utils.mjs";
const page = read("app/challenges/[id]/participants/page.tsx");
const card = read("components/challenge-participant-card.tsx");
assert(page.includes("data-mobile-participant-tools"));
assert(page.includes("mobile-card-list"));
assert(card.includes("data-mobile-participant-card"));
assert(card.includes("aspect-[16/10]"));
console.log("mobile participant cards: ok");
