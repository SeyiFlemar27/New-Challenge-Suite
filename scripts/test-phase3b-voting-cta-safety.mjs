import assert from "node:assert/strict";
import { read } from "./production-flow-test-utils.mjs";
const detail = read("app/challenges/[id]/page.tsx");
assert(detail.includes("votingOpen && eligibleSubmissionCount > 0"));
assert(detail.includes("/votes") && detail.includes("/bonus-votes"));
console.log("Phase 3B voting CTA safety checks passed.");
