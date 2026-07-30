import assert from "node:assert/strict";
import { read } from "./production-flow-test-utils.mjs";
const source = read("app/explore/page.tsx");
assert(source.includes("data-mobile-explore-card"));
assert(source.includes("aspect-[16/10]"));
assert(source.includes("creator"));
assert(source.includes("participant"));
assert(source.includes("mobile-card-list"));
console.log("mobile Explore cards: ok");
