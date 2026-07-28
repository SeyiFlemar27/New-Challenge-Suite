import assert from "node:assert/strict";
import { read } from "./production-flow-test-utils.mjs";
const journey = read("lib/server/participant-journey.ts");
assert(journey.includes('"request_entry"') && journey.includes('"request_pending"') && journey.includes('requestStatus === "approved"'));
console.log("Phase 3B manual approval flow checks passed.");
