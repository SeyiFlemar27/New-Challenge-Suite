import assert from "node:assert/strict";
import { read } from "./production-flow-test-utils.mjs";

const page = read("app/challenges/[id]/page.tsx");
assert(page.includes("Explore More Challenges"));
assert(!page.includes("<h2 className=\"text-2xl font-black\">Recommended Challenges</h2>"));
console.log("challenge recommendation fallback checks passed");
