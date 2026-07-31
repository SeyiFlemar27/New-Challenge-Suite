import assert from "node:assert/strict";
import { read } from "./production-flow-test-utils.mjs";

const page = read("app/challenges/[id]/page.tsx");
for (const label of ["Prize pool confirmed", "Sponsor funding pending confirmation", "Prize breakdown not published", "Prize under verification"]) assert(page.includes(label), label);
assert(!page.includes("Funding and prize status require review"));
console.log("challenge public prize status checks passed");
