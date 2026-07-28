import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
const flow = readFileSync("lib/server/challenge-production-flow.ts", "utf8");
assert(flow.includes("CHALLENGE_FLOW_AUDIT_EVENTS"), "challenge flow audit event constants must exist");
assert(flow.includes("payoutExecuted: false"), "event flow must not execute payouts");
assert(flow.includes("providerExecutionEnabled: false"), "provider execution must remain disabled");
console.log("real event timeline checks passed");
