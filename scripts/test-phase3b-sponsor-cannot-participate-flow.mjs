import assert from "node:assert/strict";
import { read } from "./production-flow-test-utils.mjs";
const journey = read("lib/server/participant-journey.ts");
const submissions = read("app/api/submissions/route.ts");
assert(journey.includes('"blocked_sponsor"') && submissions.includes("SPONSOR_ACCOUNT_BLOCKED"));
console.log("Phase 3B sponsor restriction checks passed.");
