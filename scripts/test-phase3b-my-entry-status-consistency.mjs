import assert from "node:assert/strict";
import { read } from "./production-flow-test-utils.mjs";
const entries = read("app/my-entries/page.tsx");
const journey = read("lib/server/participant-journey.ts");
assert(entries.includes("View My Entry") && entries.includes("/submissions/"));
assert(journey.includes('"already_submitted"') && journey.includes('"fix_and_resubmit"'));
console.log("Phase 3B My Entry status checks passed.");
