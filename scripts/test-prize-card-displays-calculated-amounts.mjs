import assert from "node:assert/strict";
import { read } from "./production-flow-test-utils.mjs";

const page = read("app/challenges/[id]/page.tsx");
assert(page.includes("split.expectedAmountCents"));
assert(page.includes("calculated"));
assert(!page.includes("Visible jackpot:"));
console.log("challenge prize calculated amount checks passed");
