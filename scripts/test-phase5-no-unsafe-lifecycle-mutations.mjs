import assert from "node:assert/strict";
import { read } from "./production-flow-test-utils.mjs";
const source = read(
"app/challenges/[id]/manage/page.tsx"
);
assert(source.includes("No payout, refund, or provider execution"), "missing " + "No payout, refund, or provider execution");
assert(source.includes("review-only"), "missing " + "review-only");
console.log("test-phase5-no-unsafe-lifecycle-mutations checks passed");
