import assert from "node:assert/strict";
import { read } from "./production-flow-test-utils.mjs";
const journey = read("lib/server/participant-journey.ts");
const join = read("app/api/challenges/[id]/join/route.ts");
assert(journey.includes('"register"') && journey.includes('"enter_challenge"') && journey.includes('"submit_entry"'));
assert(join.includes('body.action ?? "register"') && join.includes('requestedAction === "enter_challenge"'));
console.log("Phase 3B free public participant flow checks passed.");
