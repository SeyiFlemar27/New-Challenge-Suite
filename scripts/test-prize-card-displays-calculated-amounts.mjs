import assert from "node:assert/strict";
import { read } from "./production-flow-test-utils.mjs";

const page = read("app/challenges/[id]/page.tsx");
assert(page.includes("split.expectedAmountCents"));
assert(page.includes("prizeAmountKind"));
assert(page.includes('"Prize amount"'));
assert(page.includes('"Estimated prize"'));
assert(!page.includes("Visible jackpot:"));
console.log("challenge prize amount display checks passed");
