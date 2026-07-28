import assert from "node:assert/strict";
import { read } from "./production-flow-test-utils.mjs";
const journey = read("lib/server/participant-journey.ts");
const submissions = read("app/api/submissions/route.ts");
assert(journey.includes('"blocked_owner"') && journey.includes("Creators cannot participate"));
assert(submissions.includes("SELF_ENTRY_NOT_ALLOWED"));
console.log("Phase 3B owner restriction checks passed.");
