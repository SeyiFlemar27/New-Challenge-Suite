import assert from "node:assert/strict";
import { read } from "./production-flow-test-utils.mjs";
const source = read("app/explore/page.tsx");
assert(source.includes("data-mobile-explore-tools"));
for (const label of ["Search", "Filter", "Sort"]) assert(source.includes(label), label);
assert(source.includes("filtersOpen"));
console.log("mobile Explore controls: ok");
